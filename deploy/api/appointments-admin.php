<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require_once __DIR__ . '/appointment-auth.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function admin_response(int $status, array $body): never { http_response_code($status); echo json_encode($body); exit; }
try {
    $config = appointment_config();
    if (!appointment_https() && !appointment_local()) admin_response(403, ['ok' => false, 'code' => 'https_required']);
    appointment_session();
    if (!appointment_authenticated($config)) admin_response(401, ['ok' => false, 'code' => 'sign_in_required']);
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($method === 'GET') {
        $zone = new DateTimeZone('America/Denver');
        $from = (string) ($_GET['from'] ?? (new DateTimeImmutable('-30 days', $zone))->format('Y-m-d'));
        $to = (string) ($_GET['to'] ?? (new DateTimeImmutable('+365 days', $zone))->format('Y-m-d'));
        if (!appointment_date($from) || !appointment_date($to) || $to < $from || (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days > 400) throw new InvalidArgumentException('Choose a date range of at most 400 days');
        // Close out anything whose time has passed before listing. The manager
        // polls this every few seconds, so appointments expire on their own
        // without depending on a cron job being configured.
        appointment_expire_past($config);
        $records = appointment_transaction($config, static function (array &$all) use ($from, $to): array {
            $list = array_values(array_filter($all, static fn(array $record): bool => $record['date'] >= $from && $record['date'] <= $to));
            usort($list, static fn(array $a, array $b): int => strcmp($a['date'] . $a['time'], $b['date'] . $b['time']));
            return array_map(static function (array $record): array { unset($record['fingerprint']); return $record; }, $list);
        }, false);
        admin_response(200, ['ok' => true, 'appointments' => $records]);
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); admin_response(405, ['ok' => false]); }
    if (!appointment_origin($config) || !appointment_csrf((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) admin_response(403, ['ok' => false, 'code' => 'invalid_token']);
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') || (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 4000) admin_response(415, ['ok' => false]);
    try { $input = json_decode((string) file_get_contents('php://input', false, null, 0, 4001), true, 16, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new InvalidArgumentException('Invalid request'); }
    if (!is_array($input)) throw new InvalidArgumentException('Invalid request');
    $action = $input['action'] ?? '';
    if ($action === 'create') $record = appointment_manual($config, $input);
    elseif (in_array($action, ['confirm', 'cancel'], true) && is_string($input['id'] ?? null) && preg_match('/^[a-f0-9-]{32,36}$/', $input['id'])) $record = appointment_set_status($config, $input['id'], $action === 'confirm' ? 'confirmed' : 'cancelled');
    elseif ($action === 'reschedule' && is_string($input['id'] ?? null) && preg_match('/^[a-f0-9-]{32,36}$/', $input['id'])) {
        $moveHours = $input['hours'] ?? null;
        if ($moveHours !== null && !is_int($moveHours)) throw new InvalidArgumentException('Check the hours');
        $record = appointment_reschedule($config, $input['id'], (string) ($input['date'] ?? ''), (string) ($input['time'] ?? ''), $moveHours);
    }
    else throw new InvalidArgumentException('Invalid action');
    unset($record['fingerprint']);
    admin_response(200, ['ok' => true, 'appointment' => $record]);
} catch (AppointmentConflict $error) { admin_response(409, ['ok' => false, 'message' => $error->getMessage()]);
} catch (OutOfBoundsException $error) { admin_response(404, ['ok' => false, 'message' => 'Appointment not found']);
} catch (InvalidArgumentException $error) { admin_response(422, ['ok' => false, 'message' => $error->getMessage()]);
} catch (Throwable $error) { admin_response(503, ['ok' => false, 'message' => 'The appointment manager is temporarily unavailable.']); }
