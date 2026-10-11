<?php

declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

$pdo = db();
$action = $_GET['action'] ?? '';

try {
    if ($action === 'menu') {
        json_response(['ok' => true, 'state' => get_state($pdo, true)]);
    }

    if ($action === 'me') {
        json_response(['ok' => true, 'admin' => current_admin($pdo)]);
    }

    if ($action === 'login') {
        $data = json_body();
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');

        $stmt = $pdo->prepare('SELECT * FROM admins WHERE email = ? AND active = 1');
        $stmt->execute([$email]);
        $admin = $stmt->fetch();

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            json_response(['ok' => false, 'error' => 'E-mail ou senha inválidos.'], 422);
        }

        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $admin['id'];

        json_response([
            'ok' => true,
            'admin' => [
                'id' => (int) $admin['id'],
                'name' => $admin['name'],
                'email' => $admin['email'],
            ],
        ]);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
        }
        session_destroy();
        json_response(['ok' => true]);
    }

    if ($action === 'admin_data') {
        require_admin();
        json_response(['ok' => true, 'state' => get_state($pdo, false), 'admin' => current_admin($pdo)]);
    }

    if ($action === 'save_state') {
        require_admin();
        $data = json_body();
        save_state($pdo, $data['state'] ?? []);
        json_response(['ok' => true, 'state' => get_state($pdo, false)]);
    }

    json_response(['ok' => false, 'error' => 'Ação não encontrada.'], 404);
} catch (Throwable $error) {
    json_response(['ok' => false, 'error' => 'Erro interno: ' . $error->getMessage()], 500);
}
