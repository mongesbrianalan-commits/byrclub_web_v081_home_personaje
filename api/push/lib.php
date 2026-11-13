<?php
/**
 * Notificaciones push (Web Push) — sin librerías externas, solo OpenSSL.
 *
 *   - Claves VAPID (RFC 8292): se generan solas la primera vez y quedan en la
 *     tabla push_keys. Firman cada envío (JWT ES256).
 *   - Cifrado del mensaje (RFC 8291, "aes128gcm"): el contenido viaja cifrado
 *     para el navegador del socio; Google/Apple/Mozilla no pueden leerlo.
 *
 * IMPORTANTE: mandar un aviso NUNCA tiene que romper lo que lo dispara (aceptar
 * un pedido, etc.). Todas las funciones públicas atrapan sus errores.
 *
 * Uso:
 *   byr_push_to_user($pdo, $userId, ['title' => '…', 'body' => '…', 'url' => '/perfil.html']);
 *   byr_push_broadcast($pdo, ['title' => '…', 'body' => '…', 'url' => '/prodes.html']);
 */

require_once __DIR__ . '/../helpers.php';

/* Quién manda (lo pide el estándar; Apple lo exige). Una URL del sitio, no un email personal. */
const BYR_PUSH_SUBJECT = 'https://byrclub.com';

/** ¿Está corrida la migración 2026-11-push.sql? Cachea el resultado. */
function byr_push_ready(PDO $pdo): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) $pdo->query("SHOW TABLES LIKE 'push_subscriptions'")->fetch()
                  && (bool) $pdo->query("SHOW TABLES LIKE 'push_keys'")->fetch();
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

function byr_b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function byr_b64url_decode(string $s): string
{
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) {
        $s .= str_repeat('=', 4 - $pad);
    }
    return (string) base64_decode($s, true);
}

/** Clave pública P-256 sin comprimir (0x04 || X || Y) a partir de los detalles de OpenSSL. */
function byr_push_raw_public(array $details): string
{
    $x = str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT);
    $y = str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return "\x04" . $x . $y;
}

/** PEM de una clave pública P-256 a partir de los 65 bytes crudos. */
function byr_push_public_pem(string $raw65): string
{
    // Cabecera DER de SubjectPublicKeyInfo para EC P-256 (id-ecPublicKey + prime256v1).
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw65;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function byr_push_new_ec_key()
{
    $key = openssl_pkey_new([
        'curve_name'       => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ]);
    if (!$key) {
        throw new RuntimeException('OpenSSL no pudo generar la clave EC.');
    }
    return $key;
}

/**
 * Claves VAPID del sitio. Si no existen, las genera y las guarda.
 * Devuelve ['public' => base64url, 'pem' => PEM privado].
 */
function byr_push_keys(PDO $pdo): array
{
    static $keys = null;
    if ($keys !== null) {
        return $keys;
    }
    $row = $pdo->query('SELECT public_key, private_pem FROM push_keys WHERE id = 1')->fetch();
    if (!$row) {
        $key = byr_push_new_ec_key();
        openssl_pkey_export($key, $pem);
        $public = byr_b64url_encode(byr_push_raw_public(openssl_pkey_get_details($key)));
        // INSERT IGNORE: si dos pedidos llegan juntos, gana uno y el otro relee.
        $pdo->prepare('INSERT IGNORE INTO push_keys (id, public_key, private_pem) VALUES (1, ?, ?)')
            ->execute([$public, $pem]);
        $row = $pdo->query('SELECT public_key, private_pem FROM push_keys WHERE id = 1')->fetch();
    }
    $keys = ['public' => $row['public_key'], 'pem' => $row['private_pem']];
    return $keys;
}

/** Firma DER de ECDSA → formato JOSE (r || s, 32 bytes cada uno). */
function byr_push_der_to_jose(string $der): string
{
    $pos = 2;                                   // 0x30 + largo de la secuencia
    if (ord($der[1]) & 0x80) {
        $pos += ord($der[1]) & 0x7f;
    }
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        $pos++;                                 // 0x02 (INTEGER)
        $len = ord($der[$pos]);
        $pos++;
        $int = substr($der, $pos, $len);
        $pos += $len;
        $int = ltrim($int, "\0");
        $parts[] = str_pad($int, 32, "\0", STR_PAD_LEFT);
    }
    return $parts[0] . $parts[1];
}

/** Encabezado Authorization VAPID para un endpoint. */
function byr_push_vapid_header(array $keys, string $endpoint): string
{
    $u   = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');

    $head   = byr_b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = byr_b64url_encode(json_encode([
        'aud' => $aud,
        'exp' => time() + 12 * 3600,
        'sub' => BYR_PUSH_SUBJECT,
    ], JSON_UNESCAPED_SLASHES));
    $input = $head . '.' . $claims;

    if (!openssl_sign($input, $der, $keys['pem'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('No se pudo firmar el aviso.');
    }
    $jwt = $input . '.' . byr_b64url_encode(byr_push_der_to_jose($der));
    return 'vapid t=' . $jwt . ', k=' . $keys['public'];
}

/**
 * Cifra el contenido para un navegador (RFC 8291, aes128gcm).
 * Devuelve el cuerpo binario listo para mandar.
 */
function byr_push_encrypt(string $payload, string $uaPublicB64, string $authB64): string
{
    $uaPublic = byr_b64url_decode($uaPublicB64);
    $authSec  = byr_b64url_decode($authB64);
    if (strlen($uaPublic) !== 65 || strlen($authSec) < 16) {
        throw new RuntimeException('Suscripción con claves inválidas.');
    }

    // Clave efímera del servidor para este mensaje.
    $eph      = byr_push_new_ec_key();
    $asPublic = byr_push_raw_public(openssl_pkey_get_details($eph));

    $peer = openssl_pkey_get_public(byr_push_public_pem($uaPublic));
    if (!$peer) {
        throw new RuntimeException('Clave del navegador inválida.');
    }
    $ecdh = openssl_pkey_derive($peer, $eph, 32);
    if ($ecdh === false || strlen($ecdh) !== 32) {
        throw new RuntimeException('Falló el intercambio de claves.');
    }

    // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public)
    $prkKey = hash_hmac('sha256', $ecdh, $authSec, true);
    $ikm    = hash_hmac('sha256', "WebPush: info\x00" . $uaPublic . $asPublic . "\x01", $prkKey, true);

    $salt  = random_bytes(16);
    $prk   = hash_hmac('sha256', $ikm, $salt, true);
    $cek   = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\x00\x01", $prk, true), 0, 16);
    $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\x00\x01", $prk, true), 0, 12);

    $tag    = '';
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($cipher === false) {
        throw new RuntimeException('No se pudo cifrar el aviso.');
    }

    // Encabezado: salt(16) | rs(4) | idlen(1) | keyid(65)
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
}

/**
 * Manda un mensaje a una lista de suscripciones en paralelo. Borra las que el
 * navegador dio de baja (404/410). Devuelve ['sent' => n, 'failed' => n, 'removed' => n].
 */
function byr_push_send_many(PDO $pdo, array $subs, array $msg): array
{
    $out = ['sent' => 0, 'failed' => 0, 'removed' => 0];
    if (!$subs) {
        return $out;
    }

    $payload = json_encode([
        'title' => (string) ($msg['title'] ?? 'BYR Club'),
        'body'  => (string) ($msg['body'] ?? ''),
        'url'   => (string) ($msg['url'] ?? '/index.html'),
        'tag'   => (string) ($msg['tag'] ?? ''),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $keys  = byr_push_keys($pdo);
    $ttl   = (int) ($msg['ttl'] ?? 86400);
    $gone  = [];
    $okIds = [];

    // De a 50 en paralelo, para no saturar el hosting.
    foreach (array_chunk($subs, 50) as $chunk) {
        $mh      = curl_multi_init();
        $handles = [];
        foreach ($chunk as $s) {
            try {
                $body = byr_push_encrypt($payload, $s['p256dh'], $s['auth']);
                $auth = byr_push_vapid_header($keys, $s['endpoint']);
            } catch (Throwable $e) {
                $out['failed']++;
                continue;
            }
            $ch = curl_init($s['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $body,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: ' . $auth,
                    'Content-Encoding: aes128gcm',
                    'Content-Type: application/octet-stream',
                    'TTL: ' . $ttl,
                    'Urgency: ' . (($msg['urgent'] ?? false) ? 'high' : 'normal'),
                ],
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[] = [$ch, (int) $s['id']];
        }

        do {
            $status = curl_multi_exec($mh, $running);
            if ($running) {
                curl_multi_select($mh, 1.0);
            }
        } while ($running && $status === CURLM_OK);

        foreach ($handles as [$ch, $id]) {
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($code >= 200 && $code < 300) {
                $out['sent']++;
                $okIds[] = $id;
            } elseif ($code === 404 || $code === 410) {
                $gone[] = $id;                    // el navegador ya no la quiere
            } else {
                $out['failed']++;
            }
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    }

    if ($gone) {
        $in = implode(',', array_fill(0, count($gone), '?'));
        $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($in)")->execute($gone);
        $out['removed'] = count($gone);
    }
    if ($okIds) {
        $in = implode(',', array_fill(0, count($okIds), '?'));
        $pdo->prepare("UPDATE push_subscriptions SET last_sent = NOW() WHERE id IN ($in)")->execute($okIds);
    }
    return $out;
}

/** Aviso a un socio (a todos sus dispositivos). Nunca tira error. */
function byr_push_to_user(PDO $pdo, int $userId, array $msg): array
{
    try {
        if ($userId <= 0 || !byr_push_ready($pdo)) {
            return ['sent' => 0, 'failed' => 0, 'removed' => 0];
        }
        $stmt = $pdo->prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
        $stmt->execute([$userId]);
        return byr_push_send_many($pdo, $stmt->fetchAll(), $msg);
    } catch (Throwable $e) {
        return ['sent' => 0, 'failed' => 0, 'removed' => 0, 'error' => $e->getMessage()];
    }
}

/** Aviso a todos los que activaron los avisos. Nunca tira error. */
function byr_push_broadcast(PDO $pdo, array $msg): array
{
    try {
        if (!byr_push_ready($pdo)) {
            return ['sent' => 0, 'failed' => 0, 'removed' => 0, 'error' => 'Falta correr 2026-11-push.sql.'];
        }
        $subs = $pdo->query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions')->fetchAll();
        return byr_push_send_many($pdo, $subs, $msg);
    } catch (Throwable $e) {
        return ['sent' => 0, 'failed' => 0, 'removed' => 0, 'error' => $e->getMessage()];
    }
}

/** Textos del aviso según el estado del pedido (null = ese estado no avisa). */
function byr_push_order_message(int $orderId, string $status, string $fulfillment = 'pickup'): ?array
{
    $url = '/perfil.html#mis-pedidos';
    switch ($status) {
        case 'confirmed':
            return ['title' => '✅ ¡Aceptamos tu pedido!', 'body' => "Pedido #$orderId: ya lo tenemos. Te avisamos cuando esté listo.", 'url' => $url, 'tag' => "order-$orderId"];
        case 'preparing':
            return ['title' => '🍔 Estamos preparando tu pedido', 'body' => "Pedido #$orderId: ya está en la plancha.", 'url' => $url, 'tag' => "order-$orderId"];
        case 'on_the_way':
            return ['title' => '🛵 ¡Tu pedido va en camino!', 'body' => "Pedido #$orderId: salió para tu casa.", 'url' => $url, 'tag' => "order-$orderId", 'urgent' => true];
        case 'delivered':
            return $fulfillment === 'delivery'
                ? ['title' => '🎉 ¡Pedido entregado!', 'body' => "Pedido #$orderId: que lo disfrutes. ¡Gracias por elegir BYR!", 'url' => $url, 'tag' => "order-$orderId"]
                : ['title' => '🔔 ¡Tu pedido está listo!', 'body' => "Pedido #$orderId: pasá a retirarlo por el local.", 'url' => $url, 'tag' => "order-$orderId", 'urgent' => true];
        case 'cancelled':
            return ['title' => 'Tu pedido fue cancelado', 'body' => "Pedido #$orderId: si tenés dudas, escribinos por WhatsApp.", 'url' => $url, 'tag' => "order-$orderId"];
    }
    return null;
}

/** Avisa al dueño del pedido el cambio de estado. Nunca tira error. */
function byr_push_order_status(PDO $pdo, int $orderId, string $status): void
{
    try {
        if (!byr_push_ready($pdo)) {
            return;
        }
        $stmt = $pdo->prepare('SELECT user_id, fulfillment FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        $o = $stmt->fetch();
        if (!$o || !$o['user_id']) {
            return;
        }
        $msg = byr_push_order_message($orderId, $status, (string) $o['fulfillment']);
        if ($msg) {
            byr_push_to_user($pdo, (int) $o['user_id'], $msg);
        }
    } catch (Throwable $e) {
        /* un aviso que falla no rompe el pedido */
    }
}
