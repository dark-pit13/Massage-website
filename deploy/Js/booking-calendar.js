// Preferred dates use Mountain Time; calendar arithmetic uses UTC to avoid DST shifts.
window.createBookingCalendar = function ({ root, today, dateInput, timeInput, onChange, getRequiredHours = () => 1, getReservationId = () => '', onUnavailable = () => {}, onAvailabilityChange = () => {}, hours = window.bookingHours || { openingHour: 8, closingHour: 22, onlineStartHour: 17 } }) {
    const text = window.websiteText || (value => value);
    const locale = document.documentElement.lang || 'en';
    const range = root.querySelector('#booking-week-range');
    const previous = root.querySelector('#booking-previous-week');
    const next = root.querySelector('#booking-next-week');
    const days = root.querySelector('#booking-calendar-days');
    const times = root.querySelector('#booking-calendar-times');
    const selection = root.querySelector('#booking-calendar-selection');
    const dialog = root.querySelector('#booking-calendar-unavailable');
    const unavailableMessage = root.querySelector('#booking-calendar-unavailable-message');
    const availabilityMessage = root.querySelector('#booking-calendar-availability');
    const retry = root.querySelector('#booking-calendar-retry');
    let availability = 'idle';
    let loadedWeek = '';
    let busy = [];
    let loadVersion = 0;
    let controller;
    // Hours from openingHour are shown; only onlineStartHour onward can be booked online.
    const firstShown = hours.openingHour * 60;
    const onlineStartHour = hours.onlineStartHour ?? hours.openingHour;
    const opening = onlineStartHour * 60;
    const closing = hours.closingHour * 60;
    const clock = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    const requiredHours = () => Math.max(1, getRequiredHours());
    // Online hours per weekday, e.g. { tue: [20, 22], mon: null }. Days without hours are closed.
    const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    function onlineWindow(date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
        // One date set from the manager app overrides the weekday pattern.
        const overrides = hours.dateOverrides;
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, date)) {
            const window = overrides[date];
            return Array.isArray(window) ? [window[0] * 60, window[1] * 60] : null;
        }
        const weekly = hours.weeklyOnlineHours;
        if (!weekly) return [opening, closing];
        const day = weekly[weekdayKeys[new Date(date + 'T12:00:00Z').getUTCDay()]];
        return Array.isArray(day) ? [day[0] * 60, day[1] * 60] : null;
    }
    function isReady(date = selectedDate) {
        return availability === 'ready' && loadedWeek !== '' && date >= loadedWeek && date <= iso(addDays(parse(loadedWeek), 6));
    }
    function occupied(date, start, end) {
        return busy.some(block => block.date === date && start < block.end && block.start < end);
    }
    function canFit(time, date = selectedDate) {
        if (!/^\d{2}:00$/.test(time)) return false;
        const start = Number(time.slice(0, 2)) * 60;
        const open = onlineWindow(date);
        return isReady(date) && !!open && start >= open[0] && start + requiredHours() * 60 <= open[1] && !occupied(date, time, clock(start + requiredHours() * 60));
    }
    function rejectTime(reasonOverride) {
        commit(selectedDate, '');
        onUnavailable();
        const open = onlineWindow(selectedDate);
        const reason = reasonOverride || (open && requiredHours() * 60 > open[1] - open[0] ?
            'Your sessions need more time than is available in one day. Please choose fewer services or call (435) 525-5913.' :
            'Sorry, there isn’t enough time available for your sessions. Please choose an earlier start time or another day.');
        if (dialog && typeof dialog.showModal === 'function') {
            unavailableMessage.textContent = text(reason);
            if (!dialog.open) dialog.showModal();
        } else {
            window.alert(text(reason));
        }
    }
    root.querySelector('#booking-calendar-unavailable-close')?.addEventListener('click', () => dialog.close());
    const parse = value => new Date(value + 'T12:00:00Z');
    const iso = value => value.toISOString().slice(0, 10);
    const addDays = (value, count) => {
        const result = new Date(value);
        result.setUTCDate(result.getUTCDate() + count);
        return result;
    };
    const monday = value => addDays(value, -((value.getUTCDay() + 6) % 7));
    const firstWeek = monday(parse(today));
    let week = new Date(firstWeek);
    let selectedDate = dateInput.value;
    let selectedTime = timeInput.value;
    async function refresh({ quiet = false } = {}) {
        const from = iso(week), to = iso(addDays(week, 6));
        const version = ++loadVersion;
        controller?.abort(); controller = new AbortController();
        const requestController = controller;
        const timeout = setTimeout(() => requestController.abort(), 10000);
        if (!quiet || loadedWeek !== from || availability !== 'ready') availability = 'loading';
        render();
        try {
            const ownId = getReservationId();
            const response = await fetch('/api/availability.php?' + new URLSearchParams({ from, to }), { credentials: 'same-origin', cache: 'no-store', signal: requestController.signal, headers: ownId ? { 'X-Booking-Request-Id': ownId } : {} });
            const result = await response.json();
            if (!response.ok || result.ok !== true || !Array.isArray(result.busy) || !result.busy.every(block => /^\d{4}-\d{2}-\d{2}$/.test(block.date) && /^\d{2}:00$/.test(block.start) && /^\d{2}:00$/.test(block.end) && block.start < block.end)) throw Error('Availability unavailable');
            if (version !== loadVersion) return false;
            busy = result.busy; loadedWeek = from; availability = 'ready';
            render(); onAvailabilityChange(); return true;
        } catch {
            if (version !== loadVersion) return false;
            availability = 'error'; busy = []; render(); onAvailabilityChange(); return false;
        } finally { clearTimeout(timeout); }
    }
    const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
    const shortDate = date => month.format(date).replace(/\./g, '').slice(0, 3) + ' ' + date.getUTCDate();

    function currentMountainTime() {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date()).map(part => [part.type, part.value]));
        return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
    }
    function commit(date, time) {
        selectedDate = date;
        selectedTime = time;
        dateInput.value = date;
        timeInput.value = time;
        onChange({ date, time });
        render();
    }
    function render() {
        const focused = document.activeElement;
        const focusDate = focused?.dataset.calendarDate;
        const focusTime = focused?.dataset.calendarTime;
        const end = addDays(week, 6);
        range.textContent = shortDate(week) + ' – ' + shortDate(end);
        range.setAttribute('aria-label', fullDate.format(week) + ' – ' + fullDate.format(end));
        previous.disabled = week <= firstWeek;
        days.replaceChildren();
        for (let index = 0; index < 7; index++) {
            const date = addDays(week, index);
            const value = iso(date);
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.calendarDate = value;
            button.disabled = value < today || !onlineWindow(value);
            button.setAttribute('aria-label', fullDate.format(date));
            button.setAttribute('aria-pressed', String(value === selectedDate));
            if (value === today) button.setAttribute('aria-current', 'date');
            const name = document.createElement('span');
            const day = document.createElement('span');
            name.textContent = weekday.format(date).replace(/\./g, '');
            day.textContent = String(date.getUTCDate());
            button.append(name, day);
            button.addEventListener('click', () => { commit(value, value === selectedDate ? selectedTime : ''); refresh(); });
            days.append(button);
        }
        times.replaceChildren();
        const now = currentMountainTime();
        // The combined treatment duration determines the consecutive hourly block.
        const start = canFit(selectedTime) ? Number(selectedTime.slice(0, 2)) * 60 : -1;
        const endTime = start + requiredHours() * 60;
        const dayWindow = onlineWindow(selectedDate);
        for (let minutes = firstShown; minutes < closing; minutes += 60) {
            const value = clock(minutes);
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.calendarTime = value;
            button.textContent = value.replace(/^0/, '');
            button.disabled = !dayWindow || minutes < dayWindow[0] || minutes >= dayWindow[1] || !selectedDate || !isReady() || selectedDate + 'T' + value <= now || occupied(selectedDate, value, clock(minutes + 60));
            button.setAttribute('aria-pressed', String(start >= 0 && minutes >= start && minutes < endTime));
            button.setAttribute('aria-label', value.replace(/^0/, '') + ' – ' + clock(minutes + 60).replace(/^0/, ''));
            button.addEventListener('click', () => {
                if (!canFit(value)) { rejectTime(); return; }
                commit(selectedDate, value);
            });
            times.append(button);
        }
        if (selection) selection.textContent = start >= 0 ?
            text('Selected time') + ': ' + clock(start).replace(/^0/, '') + ' – ' + clock(endTime).replace(/^0/, '') + ' (' + requiredHours() + ' ' + text(requiredHours() === 1 ? 'hour' : 'hours') + ')' : '';
        times.dataset.availability = availability;
        if (availabilityMessage) availabilityMessage.textContent = availability === 'loading' ? text('Checking appointment availability…') : availability === 'error' ? text('Appointment times could not be loaded. Please try again.') : '';
        if (retry) retry.hidden = availability !== 'error';
        if (focusDate) days.querySelector('[data-calendar-date="' + focusDate + '"]:not(:disabled)')?.focus({ preventScroll: true });
        if (focusTime) times.querySelector('[data-calendar-time="' + focusTime + '"]:not(:disabled)')?.focus({ preventScroll: true });
    }
    previous.addEventListener('click', () => {
        if (week <= firstWeek) return;
        week = addDays(week, -7);
        commit('', '');
        refresh();
    });
    next.addEventListener('click', () => {
        week = addDays(week, 7);
        commit('', '');
        refresh();
    });
    [days, times].forEach(group => group.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(group.querySelectorAll('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement);
        if (index < 0) return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
            (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[target].focus();
    }));
    retry?.addEventListener('click', () => refresh());
    window.addEventListener('focus', () => { if (root.getClientRects().length) refresh({ quiet: true }); });
    setInterval(() => { if (document.visibilityState === 'visible' && root.getClientRects().length) refresh({ quiet: true }); }, 15000);
    render();
    refresh();
    return {
        canFit,
        isReady,
        refresh,
        rejectTime,
        clearTime() { commit(selectedDate, ''); },
        sync({ date, time }, load = true) {
            selectedDate = date;
            selectedTime = time;
            if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today) week = monday(parse(date));
            render();
            if (load && (loadedWeek !== iso(week) || availability === 'idle')) refresh();
        }
    };
};
