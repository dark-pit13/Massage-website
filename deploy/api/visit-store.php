<?php
declare(strict_types=1);

/* Counting visits to the public website.

   Deliberately small: no cookies, no third party, and no IP address or user
   agent is ever written to disk. To tell one visitor from another within a
   single day, the address and browser are hashed together with the date and a
   secret salt; the hashes live only until the day rolls over and are then
   dropped. What is kept is counts. */

const VISIT_KEEP_DAYS = 180;
const VISIT_MAX_PER_VISITOR = 20;

function visit_path(): string { return appointment_directory(appointment_config()) . '/visits.json'; }
function visit_today(): string { return (new DateTimeImmutable('now', new DateTimeZone('America/Denver')))->format('Y-m-d'); }

function visit_blank(): array {
    return ['people' => 0, 'total' => 0, 'days' => [], 'today' => ['date' => '', 'seen' => []], 'salt' => bin2hex(random_bytes(16))];
}

function visit_read(): array {
    $raw = @file_get_contents(visit_path());
    if ($raw === false || $raw === '') return visit_blank();
    try { $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (Throwable) { return visit_blank(); }
    if (!is_array($data)) return visit_blank();
    $data += visit_blank();
    foreach (['days', 'today'] as $key) if (!is_array($data[$key])) $data[$key] = visit_blank()[$key];
    return $data;
}

/** Runs $change over the stored counts under a lock and saves the result. */
function visit_transaction(callable $change): array {
    $path = visit_path();
    $handle = fopen($path, 'c+');
    if (!$handle) throw new RuntimeException('Cannot open the visit counts');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('The visit counts are busy');
        $raw = stream_get_contents($handle);
        $data = visit_blank();
        if (is_string($raw) && $raw !== '') {
            try { $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
            catch (Throwable) { $decoded = null; }
            if (is_array($decoded)) {
                $data = $decoded + $data;
                foreach (['days', 'today'] as $key) if (!is_array($data[$key])) $data[$key] = visit_blank()[$key];
            }
        }
        $changed = $change($data);
        if ($changed === null) return $data;
        $encoded = json_encode($changed, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, $encoded);
        fflush($handle);
        @chmod($path, 0600);
        return $changed;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/** True when the user agent looks like a crawler rather than a person. */
function visit_is_robot(string $agent): bool {
    if ($agent === '') return true;
    return (bool) preg_match('/bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|semrush|ahrefs|screaming/i', $agent);
}

/** Keeps the path short, site-relative and free of query strings. */
function visit_clean_path(string $path): string {
    $path = explode('?', $path, 2)[0];
    $path = explode('#', $path, 2)[0];
    if ($path === '' || $path[0] !== '/') return '/';
    if (strlen($path) > 80 || !preg_match('#^/[A-Za-z0-9/_.-]*$#', $path) || str_contains($path, '..')) return '/';
    if (str_ends_with($path, '/index.html')) $path = substr($path, 0, -10);
    return $path === '' ? '/' : $path;
}

function visit_record(string $path, string $address, string $agent): void {
    if (visit_is_robot($agent)) return;
    $page = visit_clean_path($path);
    $today = visit_today();
    visit_transaction(static function (array $data) use ($page, $today, $address, $agent) {
        if (($data['today']['date'] ?? '') !== $today) $data['today'] = ['date' => $today, 'seen' => []];
        $print = substr(hash('sha256', $address . '|' . $agent . '|' . $today . '|' . $data['salt']), 0, 12);
        $seen = $data['today']['seen'];
        $already = $seen[$print] ?? 0;
        // One visitor refreshing all afternoon should not read as a crowd.
        if ($already >= VISIT_MAX_PER_VISITOR) return null;
        $seen[$print] = $already + 1;
        $data['today']['seen'] = $seen;

        $day = $data['days'][$today] ?? ['views' => 0, 'visitors' => 0, 'pages' => []];
        $day['views'] = (int) $day['views'] + 1;
        if ($already === 0) {
            $day['visitors'] = (int) $day['visitors'] + 1;
            $data['people'] = (int) ($data['people'] ?? 0) + 1;
        }
        $pages = is_array($day['pages'] ?? null) ? $day['pages'] : [];
        // A runaway number of distinct paths would only be junk or probing.
        if (isset($pages[$page]) || count($pages) < 60) $pages[$page] = (int) ($pages[$page] ?? 0) + 1;
        $day['pages'] = $pages;
        $data['days'][$today] = $day;
        $data['total'] = (int) $data['total'] + 1;

        if (count($data['days']) > VISIT_KEEP_DAYS) {
            ksort($data['days']);
            $data['days'] = array_slice($data['days'], -VISIT_KEEP_DAYS, null, true);
        }
        return $data;
    });
}

/** What the manager app shows: totals, the last stretch of days, and top pages. */
function visit_summary(int $recent = 30): array {
    $data = visit_read();
    $days = is_array($data['days']) ? $data['days'] : [];
    ksort($days);
    $today = visit_today();
    $zone = new DateTimeZone('America/Denver');
    $from = static fn (int $back): string => (new DateTimeImmutable($today, $zone))->modify("-$back days")->format('Y-m-d');

    $sum = static function (string $since) use ($days): array {
        $views = 0; $visitors = 0;
        foreach ($days as $date => $day) {
            if ($date < $since) continue;
            $views += (int) ($day['views'] ?? 0);
            $visitors += (int) ($day['visitors'] ?? 0);
        }
        return ['views' => $views, 'visitors' => $visitors];
    };

    $series = [];
    for ($back = $recent - 1; $back >= 0; $back--) {
        $date = $from($back);
        $day = $days[$date] ?? null;
        $series[] = ['date' => $date, 'views' => (int) ($day['views'] ?? 0), 'visitors' => (int) ($day['visitors'] ?? 0)];
    }

    $pages = [];
    foreach ($days as $date => $day) {
        if ($date < $from($recent - 1)) continue;
        foreach ((is_array($day['pages'] ?? null) ? $day['pages'] : []) as $page => $count) {
            $pages[$page] = ($pages[$page] ?? 0) + (int) $count;
        }
    }
    arsort($pages);
    $top = [];
    foreach (array_slice($pages, 0, 6, true) as $page => $count) $top[] = ['page' => $page, 'views' => $count];

    return [
        'total' => (int) ($data['people'] ?? 0),
        'views' => (int) ($data['total'] ?? 0),
        'today' => $sum($today),
        'week' => $sum($from(6)),
        'month' => $sum($from($recent - 1)),
        'series' => $series,
        'top' => $top,
        'since' => array_key_first($days) ?: null
    ];
}

/** Counted when the public booking calendar asks the server for free hours.
    That request is the one moment a static page tells the server a person is
    there, so it stands in for "someone looked at the site". */
function visit_record_calendar(): void {
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($referer !== '') {
        $from = parse_url($referer, PHP_URL_HOST);
        if (!is_string($from) || strcasecmp($from, (string) preg_replace('/:\d+$/', '', $host)) !== 0) return;
    }
    $path = $referer === '' ? '/book-a-session.html' : (string) (parse_url($referer, PHP_URL_PATH) ?: '/');
    visit_record($path, (string) ($_SERVER['REMOTE_ADDR'] ?? ''), (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
}
