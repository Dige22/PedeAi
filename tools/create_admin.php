<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit('Not found');
}

require __DIR__ . '/../app/bootstrap.php';

[$script, $email, $password, $name] = array_pad($argv, 4, null);

if (!$email || !$password) {
    fwrite(STDERR, "Uso: php tools/create_admin.php email senha \"Nome\"\n");
    exit(1);
}

$pdo = db();
$stmt = $pdo->prepare('
    INSERT INTO admins (name, email, password_hash, active)
    VALUES (:name, :email, :password_hash, 1)
    ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        active = 1
');
$stmt->execute([
    ':name' => $name ?: 'Administrador',
    ':email' => strtolower(trim($email)),
    ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);

echo "Admin criado/atualizado: " . strtolower(trim($email)) . PHP_EOL;
