<?php
/**
 * BYR DT — subir (o borrar) la foto del escudo.
 *
 * multipart/form-data con el archivo en "crest" (jpg, png, webp o gif; hasta
 * 8 MB). Se recorta al centro en un cuadrado y se guarda como JPG de 256 px,
 * así pesa poco y nadie sube un archivo raro: lo que queda en el servidor es
 * una imagen nueva que armamos nosotros.
 * Para borrarlo: POST con remove=1.
 */
require_once __DIR__ . '/lib.php';
require_method('POST');

$userId = require_auth();
$pdo    = db();
byr_dt_require_ready($pdo);

$t = byr_dt_team_of($pdo, $userId);
if (!$t) {
    json_out(['error' => 'Primero creá tu equipo.'], 422);
}

$dirRel = 'uploads/dt';
$dirAbs = dirname(__DIR__, 2) . '/' . $dirRel;

function byr_dt_drop_crest(string $base, ?string $rel): void
{
    if ($rel && strpos($rel, 'uploads/dt/') === 0) {
        @unlink($base . '/' . $rel);
    }
}

if (!empty($_POST['remove'])) {
    byr_dt_drop_crest(dirname(__DIR__, 2), $t['crest']);
    $pdo->prepare('UPDATE dt_teams SET crest = NULL WHERE id = ?')->execute([(int) $t['id']]);
    json_out(['ok' => true, 'crest' => null]);
}

$f = $_FILES['crest'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = $f['error'] ?? UPLOAD_ERR_NO_FILE;
    $msg  = in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
        ? 'La foto es muy pesada. Probá con otra.'
        : 'No llegó la foto. Probá de nuevo.';
    json_out(['error' => $msg], 422);
}
if ($f['size'] > 8 * 1024 * 1024) {
    json_out(['error' => 'La foto es muy pesada (máximo 8 MB).'], 422);
}

$info = @getimagesize($f['tmp_name']);
$types = [IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif'];
if (!$info || !isset($types[$info[2]]) || !function_exists($types[$info[2]])) {
    json_out(['error' => 'Ese archivo no es una foto que podamos usar (JPG, PNG o WEBP).'], 422);
}
if ($info[0] * $info[1] > 40000000) {
    json_out(['error' => 'La foto es demasiado grande.'], 422);
}

$src = @$types[$info[2]]($f['tmp_name']);
if (!$src) {
    json_out(['error' => 'No pudimos leer la foto. Probá con otra.'], 422);
}

/* Las fotos del celu traen la rotación aparte (EXIF): la aplicamos. */
if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
    $exif = @exif_read_data($f['tmp_name']);
    $rot  = ['3' => 180, '6' => -90, '8' => 90][(string) ($exif['Orientation'] ?? '')] ?? 0;
    if ($rot) {
        $r = imagerotate($src, $rot, 0);
        if ($r) { imagedestroy($src); $src = $r; }
    }
}

$w = imagesx($src);
$h = imagesy($src);
$side = min($w, $h);
$dst  = imagecreatetruecolor(256, 256);
imagefill($dst, 0, 0, imagecolorallocate($dst, 3, 18, 74));
imagecopyresampled($dst, $src, 0, 0, (int) (($w - $side) / 2), (int) (($h - $side) / 2), 256, 256, $side, $side);
imagedestroy($src);

if (!is_dir($dirAbs)) {
    @mkdir($dirAbs, 0755, true);
    /* Nada que se suba acá se ejecuta como código. */
    @file_put_contents($dirAbs . '/.htaccess', "php_flag engine off\nRemoveHandler .php .phtml .php5\nOptions -Indexes\n");
}
$file = $dirRel . '/' . (int) $t['id'] . '-' . bin2hex(random_bytes(6)) . '.jpg';
if (!@imagejpeg($dst, dirname(__DIR__, 2) . '/' . $file, 85)) {
    imagedestroy($dst);
    json_out(['error' => 'No pudimos guardar la foto. Probá de nuevo en un rato.'], 500);
}
imagedestroy($dst);

byr_dt_drop_crest(dirname(__DIR__, 2), $t['crest']);
$pdo->prepare('UPDATE dt_teams SET crest = ? WHERE id = ?')->execute([$file, (int) $t['id']]);

json_out(['ok' => true, 'crest' => byr_dt_crest_url($file)]);
