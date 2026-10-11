<?php

declare(strict_types=1);

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function app_config(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }

    return $config;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = app_config();
    $databasePath = $config['database_path'];
    $databaseDir = dirname($databasePath);

    if (!is_dir($databaseDir)) {
        mkdir($databaseDir, 0750, true);
    }

    restore_legacy_database($databasePath, $config['legacy_database_paths'] ?? []);

    $pdo = new PDO('sqlite:' . $databasePath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

    migrate($pdo);
    seed_defaults($pdo);
    seed_bootstrap_admin($pdo);

    return $pdo;
}

function restore_legacy_database(string $databasePath, array $legacyPaths): void
{
    if (is_file($databasePath) && filesize($databasePath) > 0) {
        return;
    }

    foreach ($legacyPaths as $legacyPath) {
        if (!is_string($legacyPath) || $legacyPath === $databasePath) {
            continue;
        }

        if (!is_file($legacyPath) || filesize($legacyPath) <= 0) {
            continue;
        }

        copy($legacyPath, $databasePath);
        @chmod($databasePath, 0640);
        return;
    }
}

function migrate(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS store (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            subtitle TEXT NOT NULL,
            address TEXT NOT NULL,
            whatsapp TEXT NOT NULL,
            delivery_fee REAL NOT NULL DEFAULT 0,
            min_order REAL NOT NULL DEFAULT 0,
            color TEXT NOT NULL,
            status TEXT NOT NULL,
            payments TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            available INTEGER NOT NULL DEFAULT 1,
            photo TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");
}

function seed_defaults(PDO $pdo): void
{
    $seeded = $pdo->query("SELECT value FROM meta WHERE key = 'seeded'")->fetchColumn();
    if ($seeded) {
        return;
    }

    $state = default_state();
    save_state($pdo, $state);

    $stmt = $pdo->prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    $stmt->execute(['seeded', '1']);
}

function seed_bootstrap_admin(PDO $pdo): void
{
    $config = app_config()['bootstrap_admin'] ?? [];
    if (empty($config['enabled'])) {
        return;
    }

    $count = (int) $pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
    if ($count > 0) {
        return;
    }

    $stmt = $pdo->prepare('
        INSERT INTO admins (name, email, password_hash, active)
        VALUES (:name, :email, :password_hash, 1)
    ');
    $stmt->execute([
        ':name' => (string) ($config['name'] ?? 'Administrador'),
        ':email' => strtolower(trim((string) ($config['email'] ?? 'admin@pedeai.local'))),
        ':password_hash' => password_hash((string) ($config['password'] ?? 'troque-esta-senha'), PASSWORD_DEFAULT),
    ]);
}

function default_state(): array
{
    return [
        'store' => [
            'name' => 'PedeAi Burger',
            'subtitle' => 'Hambúrguer artesanal, porções e bebidas geladas.',
            'address' => 'Atendimento local e delivery',
            'whatsapp' => '',
            'deliveryFee' => 5,
            'minOrder' => 20,
            'color' => '#e8590c',
            'status' => 'Aberto',
            'payments' => ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'],
        ],
        'categories' => ['Lanches', 'Porções', 'Bebidas'],
        'items' => [
            [
                'id' => 'demo-burger',
                'name' => 'Burger clássico',
                'category' => 'Lanches',
                'description' => 'Pão brioche, hambúrguer 120g, queijo, alface, tomate e molho da casa.',
                'price' => 24.9,
                'available' => true,
                'photo' => '',
            ],
            [
                'id' => 'demo-batata',
                'name' => 'Batata da casa',
                'category' => 'Porções',
                'description' => 'Batata crocante com cheddar e bacon.',
                'price' => 19.9,
                'available' => true,
                'photo' => '',
            ],
            [
                'id' => 'demo-refri',
                'name' => 'Refrigerante lata',
                'category' => 'Bebidas',
                'description' => 'Consulte sabores disponíveis.',
                'price' => 6,
                'available' => true,
                'photo' => '',
            ],
        ],
    ];
}

function get_state(PDO $pdo, bool $publicOnly = false): array
{
    $store = $pdo->query('SELECT * FROM store WHERE id = 1')->fetch() ?: [];
    $categories = $pdo->query('SELECT name FROM categories ORDER BY position, name')->fetchAll();
    $itemsSql = 'SELECT * FROM items';
    if ($publicOnly) {
        $itemsSql .= ' WHERE available = 1';
    }
    $itemsSql .= ' ORDER BY position, name';

    return [
        'store' => [
            'name' => (string) ($store['name'] ?? ''),
            'subtitle' => (string) ($store['subtitle'] ?? ''),
            'address' => (string) ($store['address'] ?? ''),
            'whatsapp' => (string) ($store['whatsapp'] ?? ''),
            'deliveryFee' => (float) ($store['delivery_fee'] ?? 0),
            'minOrder' => (float) ($store['min_order'] ?? 0),
            'color' => (string) ($store['color'] ?? '#e8590c'),
            'status' => (string) ($store['status'] ?? 'Aberto'),
            'payments' => json_decode((string) ($store['payments'] ?? '[]'), true) ?: [],
        ],
        'categories' => array_map(fn ($row) => $row['name'], $categories),
        'items' => array_map(function ($row) {
            return [
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                'category' => (string) $row['category'],
                'description' => (string) $row['description'],
                'price' => (float) $row['price'],
                'available' => (bool) $row['available'],
                'photo' => (string) $row['photo'],
            ];
        }, $pdo->query($itemsSql)->fetchAll()),
    ];
}

function save_state(PDO $pdo, array $state): void
{
    $store = $state['store'] ?? [];
    $categories = array_values(array_filter(array_map('strval', $state['categories'] ?? [])));
    $items = array_values($state['items'] ?? []);

    if (!$categories) {
        $categories = ['Cardápio'];
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('
            INSERT INTO store (id, name, subtitle, address, whatsapp, delivery_fee, min_order, color, status, payments)
            VALUES (1, :name, :subtitle, :address, :whatsapp, :delivery_fee, :min_order, :color, :status, :payments)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                subtitle = excluded.subtitle,
                address = excluded.address,
                whatsapp = excluded.whatsapp,
                delivery_fee = excluded.delivery_fee,
                min_order = excluded.min_order,
                color = excluded.color,
                status = excluded.status,
                payments = excluded.payments
        ');
        $stmt->execute([
            ':name' => trim((string) ($store['name'] ?? 'PedeAi')),
            ':subtitle' => trim((string) ($store['subtitle'] ?? '')),
            ':address' => trim((string) ($store['address'] ?? '')),
            ':whatsapp' => trim((string) ($store['whatsapp'] ?? '')),
            ':delivery_fee' => (float) ($store['deliveryFee'] ?? 0),
            ':min_order' => (float) ($store['minOrder'] ?? 0),
            ':color' => preg_match('/^#[0-9a-f]{6}$/i', (string) ($store['color'] ?? '')) ? $store['color'] : '#e8590c',
            ':status' => trim((string) ($store['status'] ?? 'Aberto')),
            ':payments' => json_encode(array_values($store['payments'] ?? []), JSON_UNESCAPED_UNICODE),
        ]);

        $pdo->exec('DELETE FROM categories');
        $stmt = $pdo->prepare('INSERT INTO categories (name, position) VALUES (:name, :position)');
        foreach ($categories as $position => $category) {
            $stmt->execute([':name' => trim($category), ':position' => $position]);
        }

        $pdo->exec('DELETE FROM items');
        $stmt = $pdo->prepare('
            INSERT INTO items (id, name, category, description, price, available, photo, position)
            VALUES (:id, :name, :category, :description, :price, :available, :photo, :position)
        ');
        foreach ($items as $position => $item) {
            $stmt->execute([
                ':id' => trim((string) ($item['id'] ?? uniqid('item-', true))),
                ':name' => trim((string) ($item['name'] ?? 'Item')),
                ':category' => trim((string) ($item['category'] ?? $categories[0])),
                ':description' => trim((string) ($item['description'] ?? '')),
                ':price' => (float) ($item['price'] ?? 0),
                ':available' => !empty($item['available']) ? 1 : 0,
                ':photo' => (string) ($item['photo'] ?? ''),
                ':position' => $position,
            ]);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}

function require_admin(): void
{
    if (empty($_SESSION['admin_id'])) {
        json_response(['ok' => false, 'error' => 'Não autenticado.'], 401);
    }
}

function current_admin(PDO $pdo): ?array
{
    if (empty($_SESSION['admin_id'])) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id, name, email FROM admins WHERE id = ? AND active = 1');
    $stmt->execute([$_SESSION['admin_id']]);
    $admin = $stmt->fetch();

    return $admin ?: null;
}

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
