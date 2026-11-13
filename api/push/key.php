<?php
/**
 * Clave pública VAPID para que el navegador se suscriba a los avisos.
 * Respuesta: { ready: bool, publicKey: string|null }
 * ready = false → falta la migración: el frontend no muestra el botón.
 */
require_once __DIR__ . '/lib.php';

$pdo = db();
if (!byr_push_ready($pdo)) {
    json_out(['ready' => false, 'publicKey' => null]);
}
try {
    json_out([
        'ready'     => true,
        'publicKey' => byr_push_keys($pdo)['public'],
        'loggedIn'  => current_user_id() !== null, // los avisos van atados a una cuenta
    ]);
} catch (Throwable $e) {
    json_out(['ready' => false, 'publicKey' => null, 'error' => 'No se pudieron preparar los avisos.']);
}
