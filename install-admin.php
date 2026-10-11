<?php

declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

$pdo = db();
$count = (int) $pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();

if ($count > 0) {
    http_response_code(404);
    exit('Not found');
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim((string) ($_POST['name'] ?? ''));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $password = (string) ($_POST['password'] ?? '');

    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
        $error = 'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.';
    } else {
        $stmt = $pdo->prepare('
            INSERT INTO admins (name, email, password_hash, active)
            VALUES (:name, :email, :password_hash, 1)
        ');
        $stmt->execute([
            ':name' => $name,
            ':email' => $email,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);

        header('Location: admin.html');
        exit;
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Criar primeiro admin - PedeAi</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <section class="login-shell">
    <form class="login-card" method="post">
      <span class="brand-mark">P</span>
      <h1>Primeiro administrador</h1>
      <p>Esta página só funciona enquanto não existir nenhum admin no banco.</p>
      <label>
        Nome
        <input name="name" required>
      </label>
      <label>
        E-mail
        <input name="email" type="email" required>
      </label>
      <label>
        Senha
        <input name="password" type="password" minlength="8" required>
      </label>
      <?php if ($error): ?>
        <div class="form-error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>
      <button class="button" type="submit">Criar admin</button>
    </form>
  </section>
</body>
</html>
