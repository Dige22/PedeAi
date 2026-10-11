<?php

$projectRoot = dirname(__DIR__);
$legacyDatabase = __DIR__ . '/.data/pedeai.sqlite';
$envDataDir = getenv('PEDEAI_DATA_DIR') ?: '';
$legacyDatabasePaths = [$legacyDatabase];

if ($envDataDir !== '') {
    $databasePath = rtrim($envDataDir, '/\\') . '/pedeai.sqlite';
} elseif (basename(dirname($projectRoot)) === 'releases') {
    $releaseRoot = dirname($projectRoot);
    $siteRoot = dirname($releaseRoot);
    $databasePath = $siteRoot . '/shared/.data/pedeai.sqlite';
    $releaseDatabases = glob($releaseRoot . '/*/app/.data/pedeai.sqlite') ?: [];
    usort($releaseDatabases, function ($a, $b) {
        return filemtime($b) <=> filemtime($a);
    });
    $legacyDatabasePaths = array_values(array_unique(array_merge($releaseDatabases, $legacyDatabasePaths)));
} else {
    $databasePath = $legacyDatabase;
}

return [
    'database_path' => $databasePath,
    'legacy_database_paths' => $legacyDatabasePaths,
    'bootstrap_admin' => [
        'enabled' => false,
        'name' => 'Administrador',
        'email' => 'admin@pedeai.local',
        'password' => 'troque-esta-senha',
    ],
];
