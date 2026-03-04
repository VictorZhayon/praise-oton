// ============================================
// STRIDE — Firebase Sync Module
// Real-time Firestore sync for shared tasks
// ============================================

const STRIDE_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCrQEtLB9YmQJvIDfg_AmvvmWFB54XyP7s",
    authDomain: "stride-pwa.firebaseapp.com",
    projectId: "stride-pwa",
    storageBucket: "stride-pwa.firebasestorage.app",
    messagingSenderId: "374837870630",
    appId: "1:374837870630:web:0ba304c09e3dca318026e7",
    measurementId: "G-9NZCREE7EG"
};

class TaskSync {
    constructor() {
        this._db = null;
        this._unsubscribe = null;
        this._listeners = [];
        this._configured = false;
        this._userId = localStorage.getItem('stride_user_role') || ''; // 'owner' or 'assistant'
        this._offlineTasks = JSON.parse(localStorage.getItem('stride_tasks') || '[]');
    }

    // Check if Firebase is configured
    get isConfigured() {
        return this._configured && this._db !== null;
    }

    get userRole() {
        return this._userId;
    }

    set userRole(role) {
        this._userId = role;
        localStorage.setItem('stride_user_role', role);
    }

    // --- Initialize Firebase with user-provided config ---
    async init(firebaseConfig) {
        try {
            if (typeof firebase === 'undefined') {
                console.warn('Firebase SDK not loaded');
                return false;
            }

            // Initialize if not already
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }

            this._db = firebase.firestore();

            // Enable offline persistence
            try {
                await this._db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                // Multi-tab or unimplemented — not critical
                console.warn('Firestore persistence:', err.code);
            }

            this._configured = true;
            localStorage.setItem('stride_firebase_config', JSON.stringify(firebaseConfig));

            // Migrate offline tasks to Firestore
            await this._migrateOfflineTasks();

            // Start listening
            this._startListener();

            return true;
        } catch (err) {
            console.error('Firebase init failed:', err);
            return false;
        }
    }

    // --- Auto-connect using hardcoded config ---
    async tryRestore() {
        try {
            return await this.init(STRIDE_FIREBASE_CONFIG);
        } catch (e) {
            return false;
        }
    }

    // --- Task CRUD ---
    async getTasks() {
        if (!this.isConfigured) return this._offlineTasks;
        try {
            const snap = await this._db.collection('tasks').orderBy('createdAt', 'desc').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            return this._offlineTasks;
        }
    }

    async saveTask(task) {
        // Always save locally
        const idx = this._offlineTasks.findIndex(t => t.id === task.id);
        if (idx >= 0) {
            this._offlineTasks[idx] = { ...this._offlineTasks[idx], ...task };
        } else {
            this._offlineTasks.push(task);
        }
        this._persistLocal();

        // Sync to Firestore
        if (this.isConfigured) {
            try {
                await this._db.collection('tasks').doc(task.id).set(task, { merge: true });
            } catch (e) {
                console.warn('Firestore save failed, saved locally:', e);
            }
        }
    }

    async deleteTask(id) {
        this._offlineTasks = this._offlineTasks.filter(t => t.id !== id);
        this._persistLocal();

        if (this.isConfigured) {
            try {
                await this._db.collection('tasks').doc(id).delete();
            } catch (e) {
                console.warn('Firestore delete failed:', e);
            }
        }
    }

    async toggleTaskStatus(id, newStatus) {
        const task = this._offlineTasks.find(t => t.id === id);
        if (task) {
            task.status = newStatus;
            task.completedAt = newStatus === 'done' ? new Date().toISOString().slice(0, 10) : null;
            this._persistLocal();
        }
        if (this.isConfigured) {
            try {
                await this._db.collection('tasks').doc(id).update({
                    status: newStatus,
                    completedAt: newStatus === 'done' ? new Date().toISOString().slice(0, 10) : null,
                });
            } catch (e) {
                console.warn('Firestore update failed:', e);
            }
        }
    }

    // --- Real-time listener ---
    _startListener() {
        if (!this.isConfigured) return;
        if (this._unsubscribe) this._unsubscribe();

        this._unsubscribe = this._db.collection('tasks')
            .orderBy('createdAt', 'desc')
            .onSnapshot((snap) => {
                this._offlineTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                this._persistLocal();
                // Notify all registered listeners
                this._listeners.forEach(fn => fn(this._offlineTasks));
            }, (err) => {
                console.warn('Firestore listener error:', err);
            });
    }

    // Register a callback for real-time updates
    onUpdate(fn) {
        this._listeners.push(fn);
    }

    // --- Helpers ---
    _persistLocal() {
        localStorage.setItem('stride_tasks', JSON.stringify(this._offlineTasks));
    }

    async _migrateOfflineTasks() {
        if (this._offlineTasks.length === 0 || !this.isConfigured) return;
        const batch = this._db.batch();
        for (const task of this._offlineTasks) {
            batch.set(this._db.collection('tasks').doc(task.id), task, { merge: true });
        }
        try {
            await batch.commit();
        } catch (e) {
            console.warn('Migration failed:', e);
        }
    }

    disconnect() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }
}

// Export as global
window.TaskSync = TaskSync;
