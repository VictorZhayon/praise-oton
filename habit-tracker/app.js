// ============================================
// STRIDE — Habit & Task Tracker
// All application logic
// ============================================

(function () {
  'use strict';

  // ---- Helpers ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const today = () => dateKey(new Date());

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function formatDateFull(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const todayStr = today();
    if (dateStr === todayStr) return 'Today';
    if (dateStr === addDays(todayStr, -1)) return 'Yesterday';
    if (dateStr === addDays(todayStr, 1)) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function formatDateShort(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getMonday(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return dateKey(d);
  }

  const escapeHtml = (s) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };

  const CATEGORIES = {
    health: { name: 'Health & Fitness', color: 'health' },
    learning: { name: 'Learning & Skills', color: 'learning' },
    work: { name: 'Work & Productivity', color: 'work' },
    mental: { name: 'Mental Wellness', color: 'mental' },
  };

  const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', custom: 'Custom', once: 'One-time' };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const ASSIGN_LABELS = { owner: '👤 Owner', assistant: '🤖 Assistant', both: '👥 Both' };

  // ---- Habit Data Store (localStorage only — PRIVATE) ----
  class HabitStore {
    constructor() {
      this._habits = JSON.parse(localStorage.getItem('stride_habits') || '[]');
      this._completions = JSON.parse(localStorage.getItem('stride_completions') || '{}');
      this._notes = JSON.parse(localStorage.getItem('stride_notes') || '{}');
    }
    getHabits() { return this._habits; }
    getHabit(id) { return this._habits.find(h => h.id === id); }
    saveHabit(data) {
      const idx = this._habits.findIndex(h => h.id === data.id);
      if (idx >= 0) this._habits[idx] = { ...this._habits[idx], ...data };
      else this._habits.push({ ...data, createdAt: today() });
      this._persist();
    }
    deleteHabit(id) {
      this._habits = this._habits.filter(h => h.id !== id);
      Object.keys(this._completions).forEach(d => { delete this._completions[d]?.[id]; });
      Object.keys(this._notes).forEach(k => { if (k.startsWith(id + ':')) delete this._notes[k]; });
      this._persist();
    }
    isCompleted(habitId, date) { return !!this._completions[date]?.[habitId]; }
    toggleCompletion(habitId, date) {
      if (!this._completions[date]) this._completions[date] = {};
      this._completions[date][habitId] = !this._completions[date][habitId];
      this._persist();
    }
    getNote(habitId, date) { return this._notes[habitId + ':' + date] || ''; }
    setNote(habitId, date, text) {
      const key = habitId + ':' + date;
      if (text) this._notes[key] = text; else delete this._notes[key];
      this._persist();
    }
    getStreak(habitId) {
      let streak = 0;
      let d = today();
      const habit = this.getHabit(habitId);
      if (!habit) return 0;
      for (let i = 0; i < 365; i++) {
        if (this._isScheduled(habit, d)) {
          if (this.isCompleted(habitId, d)) streak++;
          else break;
        }
        d = addDays(d, -1);
      }
      return streak;
    }
    getCompletionRate(habitId, days = 30) {
      let scheduled = 0, completed = 0;
      const habit = this.getHabit(habitId);
      if (!habit) return 0;
      for (let i = 0; i < days; i++) {
        const d = addDays(today(), -i);
        if (this._isScheduled(habit, d)) {
          scheduled++;
          if (this.isCompleted(habitId, d)) completed++;
        }
      }
      return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
    }
    getOverallRate(days = 30) {
      const habits = this.getHabits();
      if (!habits.length) return 0;
      let total = 0, done = 0;
      for (let i = 0; i < days; i++) {
        const d = addDays(today(), -i);
        for (const h of habits) {
          if (this._isScheduled(h, d)) {
            total++;
            if (this.isCompleted(h.id, d)) done++;
          }
        }
      }
      return total === 0 ? 0 : Math.round((done / total) * 100);
    }
    getDailyRates(days = 30) {
      const habits = this.getHabits();
      const rates = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = addDays(today(), -i);
        let total = 0, done = 0;
        for (const h of habits) {
          if (this._isScheduled(h, d)) {
            total++;
            if (this.isCompleted(h.id, d)) done++;
          }
        }
        rates.push({ date: d, rate: total === 0 ? 0 : Math.round((done / total) * 100) });
      }
      return rates;
    }
    getHabitsForDate(date) {
      return this._habits.filter(h => this._isScheduled(h, date));
    }
    _isScheduled(habit, date) {
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'once') return date === (habit.createdAt || today());
      const d = new Date(date + 'T12:00:00');
      const jsDay = d.getDay();
      const adjDay = jsDay === 0 ? 6 : jsDay - 1;
      if (habit.frequency === 'weekly') return adjDay === 0;
      if (habit.frequency === 'custom') return (habit.customDays || []).includes(adjDay);
      return false;
    }
    _persist() {
      localStorage.setItem('stride_habits', JSON.stringify(this._habits));
      localStorage.setItem('stride_completions', JSON.stringify(this._completions));
      localStorage.setItem('stride_notes', JSON.stringify(this._notes));
    }
  }

  // ---- App State ----
  const store = new HabitStore();
  const taskSync = new TaskSync();
  let currentTab = 'habits';
  let currentDate = today();
  let currentWeekStart = getMonday(today());
  let editingHabitId = null;
  let editingTaskId = null;
  let deletingId = null;
  let deletingType = null; // 'habit' or 'task'
  let taskFilter = 'all';
  let completionChart = null;
  let habitChart = null;

  // ---- Deadline/Reminder helpers ----
  function deadlineStatus(deadlineStr) {
    if (!deadlineStr) return null;
    const todayStr = today();
    const diffMs = new Date(deadlineStr + 'T23:59:59') - new Date(todayStr + 'T00:00:00');
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, cls: 'overdue' };
    if (diffDays === 0) return { label: 'Due today', cls: 'due-soon' };
    if (diffDays <= 3) return { label: `${diffDays}d left`, cls: 'due-soon' };
    return { label: formatDateShort(deadlineStr), cls: '' };
  }

  function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // ---- Init ----
  async function init() {
    const role = localStorage.getItem('stride_user_role');
    if (!role) {
      showSetup();
      return;
    }
    showApp();

    // Auto-connect Firebase
    const restored = await taskSync.tryRestore();
    updateSyncIndicator(restored);

    // Listen for real-time task updates
    taskSync.onUpdate(() => {
      if (currentTab === 'tasks') renderTasks();
    });

    startApp();
  }

  // ---- Setup Screen ----
  function showSetup() {
    $('#setupScreen').style.display = '';
    $('#app').style.display = 'none';

    $('#btnCompleteSetup').addEventListener('click', async () => {
      const role = document.querySelector('input[name="setupRole"]:checked').value;
      taskSync.userRole = role;

      // Auto-connect using hardcoded config
      const ok = await taskSync.tryRestore();
      updateSyncIndicator(ok);

      showApp();
      startApp();
    });

    $('#btnSkipSetup').addEventListener('click', async () => {
      taskSync.userRole = 'owner';

      // Still auto-connect Firebase even on skip
      const ok = await taskSync.tryRestore();
      updateSyncIndicator(ok);

      showApp();
      startApp();
    });
  }

  function startApp() {
    renderHeaderDate();
    setupTabs();
    setupHabitModal();
    setupTaskModal();
    setupDeleteModal();
    setupDailyNav();
    setupTaskFilters();
    renderCurrentView();
    initReminders();
    registerServiceWorker();
  }

  function showApp() {
    $('#setupScreen').style.display = 'none';
    $('#app').style.display = '';

    // Hide Habits tab for assistants
    if (taskSync.userRole === 'assistant') {
      $('#tabHabits').style.display = 'none';
      currentTab = 'tasks';
      $$('.tab').forEach(t => t.classList.remove('active'));
      $('#tabTasks').classList.add('active');
      $$('.view').forEach(v => v.classList.remove('active'));
      $('#viewTasks').classList.add('active');
    }
  }

  function updateSyncIndicator(connected) {
    const el = $('#syncIndicator');
    if (!el) return;
    el.className = 'sync-indicator ' + (connected ? 'connected' : 'offline');
    el.title = connected ? 'Synced' : 'Offline';
  }

  function renderHeaderDate() {
    const d = new Date();
    const el = $('#headerDate');
    if (el) el.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ---- Tab Navigation ----
  function setupTabs() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const t = tab.dataset.tab;
        currentTab = t;
        $$('.tab').forEach(tb => { tb.classList.remove('active'); tb.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        $$('.view').forEach(v => v.classList.remove('active'));

        const viewMap = { habits: '#viewHabits', tasks: '#viewTasks', stats: '#viewStats' };
        const target = $(viewMap[t]);
        if (target) target.classList.add('active');

        // Update add button label
        const label = $('#addBtnLabel');
        if (label) label.textContent = t === 'tasks' ? 'New Task' : 'New Habit';

        renderCurrentView();
      });
    });
  }

  function renderCurrentView() {
    switch (currentTab) {
      case 'habits': renderDailyView(); break;
      case 'tasks': renderTasks(); break;
      case 'stats': renderStatsView(); break;
    }
  }

  // ---- Habit Modal ----
  function setupHabitModal() {
    const openModal = () => {
      editingHabitId = null;
      resetHabitForm();
      $('#modalTitle').textContent = 'New Habit';
      $('#btnSave').textContent = 'Save Habit';
      $('#modalOverlay').classList.add('open');
    };

    $('#btnAddNew').addEventListener('click', () => {
      if (currentTab === 'tasks') {
        openTaskModal();
      } else {
        openModal();
      }
    });
    if ($('#btnEmptyAdd')) $('#btnEmptyAdd').addEventListener('click', openModal);
    $('#modalClose').addEventListener('click', closeHabitModal);
    $('#btnCancel').addEventListener('click', closeHabitModal);
    $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) closeHabitModal(); });

    // Frequency toggle
    $('#habitFrequency').addEventListener('change', (e) => {
      $('#customDaysGroup').style.display = e.target.value === 'custom' ? '' : 'none';
    });

    // Form submit
    $('#habitForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#habitName').value.trim();
      if (!name) return;
      const habit = {
        id: editingHabitId || uid(),
        name,
        category: $('#habitCategory').value,
        frequency: $('#habitFrequency').value,
        priority: document.querySelector('#habitForm input[name="priority"]:checked').value,
        notes: $('#habitNotes').value.trim(),
        deadline: $('#habitDeadline').value || '',
        reminder: $('#habitReminder').value || '',
        customDays: [],
      };
      if (habit.frequency === 'custom') {
        habit.customDays = Array.from($$('#customDaysGroup input:checked')).map(cb => parseInt(cb.value));
      }
      if (editingHabitId) {
        const existing = store.getHabit(editingHabitId);
        habit.createdAt = existing.createdAt;
      }
      store.saveHabit(habit);
      closeHabitModal();
      renderCurrentView();
      if (habit.reminder && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
  }

  function closeHabitModal() { $('#modalOverlay').classList.remove('open'); }

  function resetHabitForm() {
    $('#habitId').value = '';
    $('#habitName').value = '';
    $('#habitCategory').value = 'health';
    $('#habitFrequency').value = 'daily';
    const prioMed = document.querySelector('#habitForm input[name="priority"][value="medium"]');
    if (prioMed) prioMed.checked = true;
    $('#habitNotes').value = '';
    $('#habitDeadline').value = '';
    $('#habitReminder').value = '';
    $$('#customDaysGroup input').forEach(cb => cb.checked = false);
    $('#customDaysGroup').style.display = 'none';
  }

  function openEditHabit(id) {
    const h = store.getHabit(id);
    if (!h) return;
    editingHabitId = id;
    $('#modalTitle').textContent = 'Edit Habit';
    $('#btnSave').textContent = 'Update';
    $('#habitName').value = h.name;
    $('#habitCategory').value = h.category;
    $('#habitFrequency').value = h.frequency;
    const prioInput = document.querySelector(`#habitForm input[name="priority"][value="${h.priority}"]`);
    if (prioInput) prioInput.checked = true;
    $('#habitNotes').value = h.notes || '';
    $('#habitDeadline').value = h.deadline || '';
    $('#habitReminder').value = h.reminder || '';
    if (h.frequency === 'custom') {
      $('#customDaysGroup').style.display = '';
      $$('#customDaysGroup input').forEach(cb => { cb.checked = (h.customDays || []).includes(parseInt(cb.value)); });
    }
    $('#modalOverlay').classList.add('open');
  }

  // ---- Task Modal ----
  function setupTaskModal() {
    $('#taskModalClose').addEventListener('click', closeTaskModal);
    $('#btnTaskCancel').addEventListener('click', closeTaskModal);
    $('#taskModalOverlay').addEventListener('click', (e) => { if (e.target === $('#taskModalOverlay')) closeTaskModal(); });
    if ($('#btnTaskEmptyAdd')) $('#btnTaskEmptyAdd').addEventListener('click', openTaskModal);

    // Form submit
    $('#taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#taskName').value.trim();
      if (!name) return;
      const task = {
        id: editingTaskId || uid(),
        name,
        status: 'todo',
        priority: document.querySelector('#taskForm input[name="taskPriority"]:checked').value,
        deadline: $('#taskDeadline').value || '',
        reminder: $('#taskReminder').value || '',
        assignedTo: document.querySelector('input[name="taskAssign"]:checked').value,
        notes: $('#taskNotes').value.trim(),
        createdAt: today(),
        completedAt: null,
      };
      if (editingTaskId) {
        // Preserve status and createdAt when editing
        const tasks = await taskSync.getTasks();
        const existing = tasks.find(t => t.id === editingTaskId);
        if (existing) {
          task.status = existing.status;
          task.createdAt = existing.createdAt;
          task.completedAt = existing.completedAt;
        }
      }
      await taskSync.saveTask(task);
      closeTaskModal();
      renderTasks();
      if (task.reminder && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
  }

  function openTaskModal() {
    editingTaskId = null;
    resetTaskForm();
    $('#taskModalTitle').textContent = 'New Task';
    $('#btnTaskSave').textContent = 'Save Task';
    $('#taskModalOverlay').classList.add('open');
  }

  function closeTaskModal() { $('#taskModalOverlay').classList.remove('open'); }

  function resetTaskForm() {
    $('#taskId').value = '';
    $('#taskName').value = '';
    const prioMed = document.querySelector('#taskForm input[name="taskPriority"][value="medium"]');
    if (prioMed) prioMed.checked = true;
    $('#taskDeadline').value = '';
    $('#taskReminder').value = '';
    const assignOwner = document.querySelector('input[name="taskAssign"][value="owner"]');
    if (assignOwner) assignOwner.checked = true;
    $('#taskNotes').value = '';
  }

  async function openEditTask(id) {
    const tasks = await taskSync.getTasks();
    const t = tasks.find(tk => tk.id === id);
    if (!t) return;
    editingTaskId = id;
    $('#taskModalTitle').textContent = 'Edit Task';
    $('#btnTaskSave').textContent = 'Update Task';
    $('#taskName').value = t.name;
    const prioInput = document.querySelector(`#taskForm input[name="taskPriority"][value="${t.priority}"]`);
    if (prioInput) prioInput.checked = true;
    $('#taskDeadline').value = t.deadline || '';
    $('#taskReminder').value = t.reminder || '';
    const assignInput = document.querySelector(`input[name="taskAssign"][value="${t.assignedTo || 'owner'}"]`);
    if (assignInput) assignInput.checked = true;
    $('#taskNotes').value = t.notes || '';
    $('#taskModalOverlay').classList.add('open');
  }

  // ---- Delete Modal ----
  function setupDeleteModal() {
    $('#btnDeleteCancel').addEventListener('click', closeDeleteModal);
    $('#deleteOverlay').addEventListener('click', (e) => { if (e.target === $('#deleteOverlay')) closeDeleteModal(); });
    $('#btnDeleteConfirm').addEventListener('click', async () => {
      if (deletingType === 'habit' && deletingId) {
        store.deleteHabit(deletingId);
      } else if (deletingType === 'task' && deletingId) {
        await taskSync.deleteTask(deletingId);
      }
      deletingId = null;
      deletingType = null;
      closeDeleteModal();
      renderCurrentView();
    });
  }

  function openDeleteModal(id, type) {
    deletingId = id;
    deletingType = type;
    $('#deleteTitle').textContent = type === 'habit' ? 'Delete Habit?' : 'Delete Task?';
    $('#deleteMsg').textContent = type === 'habit'
      ? 'This will permanently remove this habit and all its history.'
      : 'This will permanently remove this task.';
    $('#deleteOverlay').classList.add('open');
  }

  function closeDeleteModal() { $('#deleteOverlay').classList.remove('open'); }

  // ---- Daily Navigation ----
  function setupDailyNav() {
    if ($('#prevDay')) $('#prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); renderDailyView(); });
    if ($('#nextDay')) $('#nextDay').addEventListener('click', () => { currentDate = addDays(currentDate, 1); renderDailyView(); });
  }

  // ---- Task Filters ----
  function setupTaskFilters() {
    $$('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        taskFilter = chip.dataset.filter;
        $$('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderTasks();
      });
    });
  }

  // ---- Render: Daily Habits View ----
  function renderDailyView() {
    const dateEl = $('#dailyDate');
    if (dateEl) dateEl.textContent = formatDateFull(currentDate);
    const habits = store.getHabitsForDate(currentDate);
    const list = $('#dailyHabitList');
    const empty = $('#dailyEmpty');
    const summary = $('#dailySummary');

    if (habits.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      summary.innerHTML = '';
      return;
    }
    empty.style.display = 'none';

    // Summary
    const completed = habits.filter(h => store.isCompleted(h.id, currentDate)).length;
    const pct = Math.round((completed / habits.length) * 100);
    summary.innerHTML = `
      <span class="summary-chip"><span class="count">${completed}/${habits.length}</span> completed</span>
      <span class="summary-chip"><span class="count">${pct}%</span> done</span>`;

    // Group by category
    const grouped = {};
    for (const h of habits) {
      if (!grouped[h.category]) grouped[h.category] = [];
      grouped[h.category].push(h);
    }

    let html = '';
    for (const [cat, items] of Object.entries(grouped)) {
      const catInfo = CATEGORIES[cat] || { name: cat, color: 'health' };
      html += `<div class="category-section">
        <div class="category-label ${catInfo.color}">
          <span class="category-dot ${catInfo.color}"></span>${catInfo.name}
        </div>`;
      for (const h of items) {
        const done = store.isCompleted(h.id, currentDate);
        const streak = store.getStreak(h.id);
        const note = store.getNote(h.id, currentDate);
        const ds = deadlineStatus(h.deadline);
        html += `
        <div class="habit-card ${done ? 'completed' : ''}" data-id="${h.id}">
          <label class="habit-check">
            <input type="checkbox" ${done ? 'checked' : ''} data-habit-id="${h.id}" data-date="${currentDate}">
            <span class="checkmark"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          </label>
          <div class="habit-content">
            <div class="habit-top-row">
              <span class="habit-name">${escapeHtml(h.name)}</span>
              ${h.priority !== 'medium' ? `<span class="priority-badge ${h.priority}">${h.priority}</span>` : ''}
              ${streak > 0 ? `<span class="streak-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>${streak}d</span>` : ''}
              ${ds ? `<span class="deadline-badge ${ds.cls}">${ds.label}</span>` : ''}
              ${h.reminder ? `<span class="reminder-badge">${formatTime12(h.reminder)}</span>` : ''}
            </div>
            <div class="habit-meta">${FREQ_LABELS[h.frequency]}${h.notes ? ' · ' + escapeHtml(h.notes) : ''}</div>
            <textarea class="habit-notes-input" placeholder="Add a note for today…" data-habit-id="${h.id}" data-date="${currentDate}" rows="1">${escapeHtml(note)}</textarea>
          </div>
          <div class="manage-card-actions">
            <button class="btn-icon btn-edit-habit" data-id="${h.id}" aria-label="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-delete-habit" data-id="${h.id}" aria-label="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    list.innerHTML = html;

    // Event listeners
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        store.toggleCompletion(cb.dataset.habitId, cb.dataset.date);
        renderDailyView();
      });
    });
    list.querySelectorAll('.habit-notes-input').forEach(ta => {
      ta.addEventListener('input', debounce(() => {
        store.setNote(ta.dataset.habitId, ta.dataset.date, ta.value.trim());
      }, 500));
    });
    list.querySelectorAll('.btn-edit-habit').forEach(btn => {
      btn.addEventListener('click', () => openEditHabit(btn.dataset.id));
    });
    list.querySelectorAll('.btn-delete-habit').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'habit'));
    });
  }

  // ---- Render: Tasks View ----
  async function renderTasks() {
    let tasks = await taskSync.getTasks();

    // Filter
    if (taskFilter !== 'all') {
      tasks = tasks.filter(t => t.status === taskFilter);
    }

    // Sort: priority (high first), then deadline (soonest first), then created
    tasks.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    const list = $('#taskList');
    const empty = $('#taskEmpty');

    if (tasks.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    let html = '';
    for (const t of tasks) {
      const ds = deadlineStatus(t.deadline);
      html += `
      <div class="task-card priority-${t.priority} status-${t.status}" data-id="${t.id}">
        <div class="task-content">
          <div class="task-top-row">
            <span class="task-name">${escapeHtml(t.name)}</span>
            <span class="priority-badge ${t.priority}">${t.priority}</span>
            ${ds ? `<span class="deadline-badge ${ds.cls}">${ds.label}</span>` : ''}
            ${t.reminder ? `<span class="reminder-badge">${formatTime12(t.reminder)}</span>` : ''}
            <span class="assign-badge">${ASSIGN_LABELS[t.assignedTo] || '👤'}</span>
          </div>
          <div class="task-meta">
            ${t.notes ? `<span>${escapeHtml(t.notes)}</span>` : ''}
            ${t.completedAt ? `<span>Done ${formatDateShort(t.completedAt)}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <select class="status-select ${t.status}" data-id="${t.id}">
            <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
            <option value="in-progress" ${t.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
          <button class="btn-icon btn-edit-task" data-id="${t.id}" aria-label="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-delete-task" data-id="${t.id}" aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
    }
    list.innerHTML = html;

    // Event listeners
    list.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        await taskSync.toggleTaskStatus(sel.dataset.id, sel.value);
        renderTasks();
      });
    });
    list.querySelectorAll('.btn-edit-task').forEach(btn => {
      btn.addEventListener('click', () => openEditTask(btn.dataset.id));
    });
    list.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'task'));
    });
  }

  // ---- Render: Stats ----
  function renderStatsView() {
    const habits = store.getHabits();
    const overview = $('#statsOverview');
    const emptyEl = $('#statsEmpty');

    if (habits.length === 0) {
      overview.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    const rate = store.getOverallRate();
    const bestStreak = Math.max(0, ...habits.map(h => store.getStreak(h.id)));
    const todayHabits = store.getHabitsForDate(today());
    const doneToday = todayHabits.filter(h => store.isCompleted(h.id, today())).length;

    overview.innerHTML = `
      <div class="stat-card"><div class="stat-value">${rate}%</div><div class="stat-label">30-day completion</div></div>
      <div class="stat-card"><div class="stat-value">${bestStreak}</div><div class="stat-label">Best active streak</div></div>
      <div class="stat-card"><div class="stat-value">${doneToday}/${todayHabits.length}</div><div class="stat-label">Done today</div></div>
      <div class="stat-card"><div class="stat-value">${habits.length}</div><div class="stat-label">Total habits</div></div>`;

    // Charts
    const dailyRates = store.getDailyRates(30);
    const labels = dailyRates.map(r => formatDateShort(r.date));
    const data = dailyRates.map(r => r.rate);

    const chartColor = '#4fd1c5';
    const chartColorDim = 'rgba(79, 209, 197, 0.15)';

    if (completionChart) completionChart.destroy();
    completionChart = new Chart($('#completionChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Completion %',
          data,
          borderColor: chartColor,
          backgroundColor: chartColorDim,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: chartColor,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%', color: '#606070', font: { size: 10 } }, grid: { color: '#222230' } },
          x: { ticks: { maxTicksLimit: 8, color: '#606070', font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    if (habitChart) habitChart.destroy();
    const habitData = habits.map(h => ({
      name: h.name,
      rate: store.getCompletionRate(h.id, 30),
      color: `var(--cat-${CATEGORIES[h.category]?.color || 'health'})`,
    }));

    const catColors = { health: '#4fd1c5', learning: '#a78bfa', work: '#f6ad55', mental: '#f687b3' };
    habitChart = new Chart($('#habitChart'), {
      type: 'bar',
      data: {
        labels: habitData.map(d => d.name),
        datasets: [{
          data: habitData.map(d => d.rate),
          backgroundColor: habits.map(h => catColors[h.category] || chartColor),
          borderRadius: 6,
          barThickness: 28,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: v => v + '%', color: '#606070', font: { size: 10 } }, grid: { color: '#222230' } },
          y: { ticks: { color: '#e8e8f0', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // ---- Debounce ----
  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  // ---- Reminder / Notification System ----
  const firedReminders = new Set(JSON.parse(localStorage.getItem('stride_fired_today') || '[]'));

  function initReminders() {
    checkReminders();
    setInterval(checkReminders, 30000);

    const msUntilMidnight = new Date(today() + 'T23:59:59') - new Date() + 1000;
    setTimeout(() => {
      firedReminders.clear();
      localStorage.setItem('stride_fired_today', '[]');
    }, msUntilMidnight);
  }

  async function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayStr = today();

    // Check habit reminders
    const habits = store.getHabitsForDate(todayStr);
    for (const h of habits) {
      if (!h.reminder || store.isCompleted(h.id, todayStr) || firedReminders.has(h.id)) continue;
      if (h.reminder <= currentTime) {
        fireNotification(h.name, h.deadline, h.id);
        firedReminders.add(h.id);
      }
    }

    // Check task reminders
    const tasks = await taskSync.getTasks();
    for (const t of tasks) {
      if (!t.reminder || t.status === 'done' || firedReminders.has('t:' + t.id)) continue;
      if (t.reminder <= currentTime) {
        fireNotification(t.name, t.deadline, 't:' + t.id);
        firedReminders.add('t:' + t.id);
      }
    }

    localStorage.setItem('stride_fired_today', JSON.stringify([...firedReminders]));
  }

  function fireNotification(name, deadline, tag) {
    const ds = deadlineStatus(deadline);
    let body = `Time to: ${name}`;
    if (ds && ds.cls === 'overdue') body += ` ⚠️ ${ds.label}`;
    else if (ds && ds.cls === 'due-soon') body += ` ⏰ ${ds.label}`;
    try {
      new Notification('Stride Reminder', { body, tag: `stride-${tag}` });
    } catch (e) { /* not supported */ }
  }

  // ---- PWA Service Worker ----
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }
  }

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeHabitModal();
      closeTaskModal();
      closeDeleteModal();
    }
  });

  // ---- Start ----
  document.addEventListener('DOMContentLoaded', init);
})();
