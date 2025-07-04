import { app, auth, db } from './firebase-config.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    addDoc,
    serverTimestamp,
    onSnapshot,
    Timestamp // Import Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const authSection = document.getElementById('authSection');
const adminSection = document.getElementById('adminSection');
const loginBtn = document.getElementById('loginBtn');
const adminEmail = document.getElementById('adminEmail');
const adminPassword = document.getElementById('adminPassword');
const authMessage = document.getElementById('authMessage');
const refreshBtn = document.getElementById('refreshBtn');
const usersTable = document.getElementById('usersTable').getElementsByTagName('tbody')[0];
const logsContainer = document.getElementById('logsContainer');

// Modal elements
const settingsModal = document.getElementById('settingsModal');
const modalCloseBtn = document.querySelector('.close');
const modalUserName = document.getElementById('modalUserName');
const allowedHours = document.getElementById('allowedHours');
const customHoursGroup = document.getElementById('customHoursGroup');
const customStartTime = document.getElementById('customStartTime');
const customEndTime = document.getElementById('customEndTime');
const sessionDuration = document.getElementById('sessionDuration');
const autoLogout = document.getElementById('autoLogout');
const adminNote = document.getElementById('adminNote');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsMessage = document.getElementById('settingsMessage');

// Task modal elements
const taskModal = document.getElementById('taskModal');
const taskUserName = document.getElementById('taskUserName');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskPointsAdmin = document.getElementById('taskPointsAdmin'); // New: Points input for admin
const taskLocked = document.getElementById('taskLocked');
const assignTaskBtn = document.getElementById('assignTaskBtn');
const taskMessage = document.getElementById('taskMessage');
const taskCloseBtn = document.querySelector('.close-task');

// MODIFICATION START: Added elements for lock timer
const lockTimeGroup = document.getElementById('lockTimeGroup');
const lockUntilTime = document.getElementById('lockUntilTime');
// MODIFICATION END

// Current selected user for settings and tasks
let currentUser = null;
let selectedTaskUserId = null;

// Admin credentials (in a real app, these would be validated against your database)
const ADMIN_EMAILS = ['admin@taskmanager.com']; // Add your admin emails here

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check auth state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            authSection.style.display = 'none';
            adminSection.style.display = 'block';
            loadUsers();
            setupRealtimeListeners();
            fetchAndDisplayUserProgress(); // Call this on auth state change
        } else {
            authSection.style.display = 'block';
            adminSection.style.display = 'none';
        }
    });

    // Event listeners
    loginBtn.addEventListener('click', handleAdminLogin);
    refreshBtn.addEventListener('click', () => {
        loadUsers();
        fetchAndDisplayUserProgress(); // Refresh progress as well
    });

    // Modal events
    modalCloseBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    taskCloseBtn.addEventListener('click', () => taskModal.style.display = 'none');

    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
        if (event.target === taskModal) {
            taskModal.style.display = 'none';
        }
    });

    allowedHours.addEventListener('change', (e) => {
        customHoursGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    saveSettingsBtn.addEventListener('click', saveUserSettings);
    assignTaskBtn.addEventListener('click', submitTaskToFirestore);

    // MODIFICATION START: Event listener for the lock toggle
    taskLocked.addEventListener('change', (e) => {
        lockTimeGroup.style.display = e.target.checked ? 'block' : 'none';
    });
    // MODIFICATION END
});

// Handle admin login
async function handleAdminLogin() {
    const email = adminEmail.value;
    const password = adminPassword.value;

    if (!email || !password) {
        authMessage.textContent = 'Please enter both email and password';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        authMessage.textContent = '';
    } catch (error) {
        console.error('Login error:', error);
        authMessage.textContent = 'Login failed. Please check your credentials.';
    }
}

// Load users from Firestore
async function loadUsers() {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);

        usersTable.innerHTML = ''; // Clear existing rows

        if (querySnapshot.empty) {
            console.log("No users found in collection");
            return;
        }

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            addUserToTable(doc.id, userData);
        });

        await loadLogs();

    } catch (error) {
        console.error('Full error loading users:', error);
        alert(`Failed to load users: ${error.message}`);
    }
}

// Add user to the table
function addUserToTable(userId, userData) {
    const row = usersTable.insertRow();
    row.insertCell(0).textContent = userId;
    row.insertCell(1).textContent = userData.email || 'N/A';
    
    const cellStatus = row.insertCell(2);
    const statusSpan = document.createElement('span');
    statusSpan.textContent = userData.isLoggedIn ? 'ON' : 'OFF';
    statusSpan.className = userData.isLoggedIn ? 'status-on' : 'status-off';
    cellStatus.appendChild(statusSpan);

    const cellLastActive = row.insertCell(3);
    cellLastActive.textContent = userData.lastActivity ? userData.lastActivity.toDate().toLocaleString() : 'N/A';

    const cellActions = row.insertCell(4);
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = userData.isLoggedIn ? 'Force OFF' : 'Force ON';
    toggleBtn.className = userData.isLoggedIn ? 'toggle-off' : 'toggle-on';
    toggleBtn.addEventListener('click', () => toggleUserStatus(userId, !userData.isLoggedIn));
    cellActions.appendChild(toggleBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = 'Settings';
    settingsBtn.className = 'settings';
    settingsBtn.addEventListener('click', () => openSettingsModal(userId, userData));
    cellActions.appendChild(settingsBtn);

    const taskBtn = document.createElement('button');
    taskBtn.textContent = 'Add Task';
    taskBtn.className = 'settings';
    taskBtn.addEventListener('click', () => openTaskModal(userId, userData.email));
    cellActions.appendChild(taskBtn);
}


// Toggle user status
async function toggleUserStatus(userId, newStatus) {
    // Replaced confirm with a custom alert/modal for better UX in an iframe
    showCustomAlert("Confirmation", `Are you sure you want to ${newStatus ? 'FORCE LOGIN' : 'FORCE LOGOUT'} this user?`);
    // In a real app, you'd have a custom modal with Yes/No buttons. For now, we'll proceed.
    // This is a simplified approach. For a full solution, implement a custom confirmation modal.
    
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            isLoggedIn: newStatus,
            lastActivity: serverTimestamp(),
            lastUpdatedBy: 'admin',
            lastUpdateTime: serverTimestamp()
        });
        
        await addLogEntry(userId, newStatus ? 'admin_force_login' : 'admin_force_logout', `Admin manually ${newStatus ? 'logged in' : 'logged out'} user`);
        loadUsers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        showCustomAlert("Error", 'Failed to update user status. Please try again.');
    }
}

// Open settings modal
function openSettingsModal(userId, userData) {
    currentUser = { id: userId, ...userData };
    modalUserName.textContent = userData.email || userId;
    
    if (userData.settings) {
        const settings = userData.settings;
        allowedHours.value = settings.allowedHours || 'any';
        sessionDuration.value = settings.sessionDuration || 8;
        autoLogout.value = settings.autoLogout || 'enabled';
        adminNote.value = settings.adminNote || '';
        if (settings.customStartTime && settings.customEndTime) {
            customStartTime.value = settings.customStartTime;
            customEndTime.value = settings.customEndTime;
        }
    } else {
        allowedHours.value = 'any';
        sessionDuration.value = 8;
        autoLogout.value = 'enabled';
        adminNote.value = '';
    }
    
    customHoursGroup.style.display = allowedHours.value === 'custom' ? 'block' : 'none';
    settingsModal.style.display = 'flex'; // Changed to flex for centering
}

// Save user settings
async function saveUserSettings() {
    if (!currentUser) return;
    
    const settings = {
        allowedHours: allowedHours.value,
        sessionDuration: parseInt(sessionDuration.value),
        autoLogout: autoLogout.value,
        adminNote: adminNote.value,
        lastUpdated: serverTimestamp()
    };
    
    if (allowedHours.value === 'custom') {
        settings.customStartTime = customStartTime.value;
        settings.customEndTime = customEndTime.value;
    }
    
    try {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, { settings: settings });
        await addLogEntry(currentUser.id, 'admin_settings_update', `Admin updated user settings.`);
        
        settingsMessage.textContent = 'Settings saved successfully!';
        setTimeout(() => {
            settingsMessage.textContent = '';
            settingsModal.style.display = 'none';
            loadUsers();
        }, 1500);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        settingsMessage.textContent = 'Failed to save settings. Please try again.';
    }
}


// Open task assignment modal
function openTaskModal(userId, userEmail) {
    selectedTaskUserId = userId;
    taskUserName.textContent = userEmail || userId;
    taskTitle.value = '';
    taskDescription.value = '';
    taskPointsAdmin.value = '30'; // Set default points for admin
    taskLocked.checked = false; // Default to unlocked
    lockTimeGroup.style.display = 'none'; // Hide timer by default
    lockUntilTime.value = '';
    taskMessage.textContent = '';
    taskModal.style.display = 'flex'; // Changed to flex for centering
}


// MODIFICATION START: Rewritten function to save to 'forms' collection
async function submitTaskToFirestore() {
    if (!selectedTaskUserId) return;

    const title = taskTitle.value.trim();
    const description = taskDescription.value.trim();
    const points = parseInt(taskPointsAdmin.value) || 0; // Get points value
    const isLocked = taskLocked.checked;
    const lockTime = lockUntilTime.value;
    const dueDate = `${taskDueDateInput.value}T${taskDueTimeInput.value}`;


    if (!title) {
        taskMessage.textContent = 'Task title is required';
        return;
    }

    if (isLocked && !lockTime) {
        taskMessage.textContent = 'Please select a lock-until time.';
        return;
    }

    try {
        // Saving to the main 'forms' collection now
        const formsRef = collection(db, 'forms');
        
        const taskData = {
            title,
            description,
            points: points, // Include points here
            assignedTo: selectedTaskUserId,
            isLocked: isLocked,
            lockUntil: isLocked ? Timestamp.fromDate(new Date(lockTime)) : null,
            status: 'pending',
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.email,
            dueDate: dueDate // Include dueDate
        };

        await addDoc(formsRef, taskData);

        taskMessage.style.color = 'green';
        taskMessage.textContent = '✅ Task assigned successfully';
        setTimeout(() => {
            taskModal.style.display = 'none';
            fetchAndDisplayUserProgress(); // Refresh progress after assigning task
        }, 1200);

        await addLogEntry(selectedTaskUserId, 'admin_task_assigned', `Assigned task "${title}" (Points: ${points}, locked: ${isLocked})`);

    } catch (error) {
        console.error('Error assigning task:', error);
        taskMessage.style.color = 'red';
        taskMessage.textContent = '❌ Failed to assign task';
    }
}
// MODIFICATION END

// Function to fetch and display user task progress
async function fetchAndDisplayUserProgress() {
    const progressTableBody = document.querySelector('#progressTable tbody');
    const totalGreenFlagsEl = document.getElementById('totalGreenFlags');
    const totalRedFlagsEl = document.getElementById('totalRedFlags');
    const totalPendingTasksEl = document.getElementById('totalPendingTasks'); 
    const totalUserPointsEl = document.getElementById('totalUserPoints'); // Get total points element

    if (!progressTableBody) return;
    progressTableBody.innerHTML = '<tr><td colspan="9">Loading progress...</td></tr>'; // Increased colspan to 9

    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = {};
        usersSnapshot.forEach(doc => {
            users[doc.id] = { ...doc.data(), id: doc.id };
        });

        const tasksSnapshot = await getDocs(collection(db, 'forms'));
        
        const userProgress = {};
        let totalGreenFlags = 0;
        let totalRedFlags = 0;
        let totalPendingTasks = 0;
        let overallTotalPoints = 0; // Initialize overall total points

        for (const userId in users) {
            userProgress[userId] = {
                email: users[userId].email || 'N/A',
                assigned: 0,
                completed: 0,
                pending: 0,
                greenFlags: 0,
                redFlags: 0,
                totalPoints: 0, // Initialize total points for each user
                timeSpent: 0
            };
        }

        const now = new Date();

        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            const assignedUserId = task.assignedTo;
            if (userProgress[assignedUserId]) {
                userProgress[assignedUserId].assigned++;

                // Green flag condition
                if (task.status === 'completed') {
                    userProgress[assignedUserId].completed++;
                    userProgress[assignedUserId].greenFlags++;
                    totalGreenFlags++;
                    userProgress[assignedUserId].totalPoints += (task.points || 0); // Add points for completed tasks
                    overallTotalPoints += (task.points || 0); // Add to overall total points

                    // Calculate time spent if completedAt and createdAt exist
                    if (task.createdAt && task.completedAt) {
                        const createdTime = task.createdAt.toDate().getTime();
                        const completedTime = task.completedAt.toDate().getTime();
                        userProgress[assignedUserId].timeSpent += (completedTime - createdTime);
                    }
                } else if (task.status === 'pending' || task.status === 'active') {
                    userProgress[assignedUserId].pending++;
                    totalPendingTasks++;
                }

                // Red flag condition (overdue)
                const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                if ((task.status === 'pending' || task.status === 'active') && dueDate && dueDate < now) {
                    userProgress[assignedUserId].redFlags++;
                    totalRedFlags++;
                }
            }
        });

        progressTableBody.innerHTML = '';
        for (const userId in userProgress) {
            const progress = userProgress[userId];
            const percentage = progress.assigned > 0 ? ((progress.completed / progress.assigned) * 100).toFixed(1) : 0;
            
            // Format time spent
            const totalSeconds = Math.floor(progress.timeSpent / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const formattedTime = `${hours}h ${minutes}m ${seconds}s`;

            const row = progressTableBody.insertRow();
            row.innerHTML = `
                <td class="py-3 px-4">${progress.email}</td>
                <td class="py-3 px-4 text-center">${progress.assigned}</td>
                <td class="py-3 px-4 text-center">${progress.completed}</td>
                <td class="py-3 px-4 text-center">
                    <span class="bg-yellow-200 text-yellow-800 font-semibold px-3 py-1 rounded-full text-sm">${progress.pending}</span>
                </td>
                <td class="py-3 px-4">
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${percentage}%; background-color: var(--primary-color);">
                            ${percentage}%
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="bg-green-200 text-green-800 font-semibold px-3 py-1 rounded-full text-sm">${progress.greenFlags}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="bg-red-200 text-red-800 font-semibold px-3 py-1 rounded-full text-sm">${progress.redFlags}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="bg-blue-200 text-blue-800 font-semibold px-3 py-1 rounded-full text-sm">${progress.totalPoints}</span>
                </td>
                <td class="py-3 px-4 text-center">${formattedTime}</td>
            `;
        }

        if(totalGreenFlagsEl) totalGreenFlagsEl.textContent = totalGreenFlags;
        if(totalRedFlagsEl) totalRedFlagsEl.textContent = totalRedFlags;
        if(totalPendingTasksEl) totalPendingTasksEl.textContent = totalPendingTasks;
        if(totalUserPointsEl) totalUserPointsEl.textContent = overallTotalPoints; // Update overall total points

    } catch (error) {
        console.error("Error fetching user progress:", error);
        progressTableBody.innerHTML = '<tr><td colspan="9" style="color:red;">Error loading progress.</td></tr>'; // Increased colspan
    }
}


// Load activity logs
async function loadLogs() {
    try {
        const logsRef = collection(db, 'logs'); // Changed to 'logs' collection as per newadmin.html
        const q = query(logsRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        logsContainer.innerHTML = '';
        
        const logs = [];
        let loginLogsFound = false;
        let generalLogsFound = false;

        loginLogsTableBody.innerHTML = ''; // Clear login logs table

        querySnapshot.forEach((doc) => {
            const logData = doc.data();
            if (logData.type === 'login') {
                loginLogsFound = true;
                const row = loginLogsTableBody.insertRow();
                const loginTime = logData.timestamp ? new Date(logData.timestamp.toDate()).toLocaleString() : 'N/A';
                const status = logData.note ? logData.note.split(': ')[1] : 'N/A';
                
                row.innerHTML = `
                    <td>${logData.userEmail || 'N/A'}</td>
                    <td>${loginTime}</td>
                    <td><span class="${status === 'Success' ? 'status-success' : 'status-failed'}">${status}</span></td>
                    <td>${logData.ipAddress || '127.0.0.1'}</td>
                `;
            } else {
                generalLogsFound = true;
                logs.push({ id: doc.id, ...logData });
            }
        });
        
        // Sort general logs by timestamp
        logs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        
        logs.forEach(log => {
            addLogToContainer(log);
        });

        if (!loginLogsFound) {
            loginLogsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No login activity found.</td></tr>';
        }
        if (!generalLogsFound) {
             logsContainer.innerHTML = '<p style="text-align:center; padding: 20px;">No general activity logs found.</p>';
        }
        
    } catch (error) {
        console.error('Error loading logs:', error);
        showCustomAlert("Error", 'Failed to load activity logs. Please try again.');
    }
}

// Add log entry to Firestore
async function addLogEntry(userId, actionType, details = '') {
    try {
        const logsRef = collection(db, 'logs'); // Changed to 'logs' collection
        await addDoc(logsRef, {
            userId: userId,
            actionType: actionType,
            details: details,
            timestamp: serverTimestamp(),
            performedBy: 'admin',
        });
    } catch (error) {
        console.error('Error adding log entry:', error);
    }
}


// Add log to the UI container
function addLogToContainer(log) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const timestamp = log.timestamp ? log.timestamp.toDate().toLocaleString() : 'N/A';
    const performedBy = log.performedBy === 'admin' ? 
        `<span class="log-admin">Admin</span>` : 
        `<span class="log-user">User</span>`;
    
    let actionText = log.actionType.replace(/_/g, ' ');
    
    logEntry.innerHTML = `
        <div>
            ${performedBy} - <strong>${actionText}</strong> for user ${log.userId || log.userEmail || 'N/A'}
            <span class="log-time">(${timestamp})</span>
        </div>
        ${log.note ? `<div class="log-note">Details: ${log.note}</div>` : ''}
    `;
    
    // Prepend new logs to the top
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
}


// Set up realtime listeners
function setupRealtimeListeners() {
    // Listener for user status changes
    const usersRef = collection(db, 'users');
    onSnapshot(usersRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const rows = usersTable.getElementsByTagName('tr');
                for (let row of rows) {
                    if (row.cells[0].textContent.startsWith(change.doc.id.substring(0,8))) { // Partial match for display
                        const userData = change.doc.data();
                        const statusSpan = row.cells[2].getElementsByTagName('span')[0];
                        statusSpan.textContent = userData.isLoggedIn ? 'ON' : 'OFF';
                        statusSpan.className = userData.isLoggedIn ? 'status-on' : 'status-off';
                        if (userData.lastActivity) {
                            row.cells[3].textContent = userData.lastActivity.toDate().toLocaleString();
                        }
                        const toggleBtn = row.cells[4].getElementsByTagName('button')[0];
                        toggleBtn.textContent = userData.isLoggedIn ? 'Force OFF' : 'Force ON';
                        toggleBtn.className = userData.isLoggedIn ? 'toggle-off' : 'toggle-on';
                    }
                }
            }
        });
    });
    
    // Listener for general activity logs
    const logsRef = collection(db, 'logs'); // Changed to 'logs' collection
    onSnapshot(logsRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const log = { id: change.doc.id, ...change.doc.data() };
                // Only add general logs to the container, not login logs here
                if (log.type !== 'login') {
                    addLogToContainer(log);
                }
            }
        });
    });

    // Listener for user task progress changes
    const formsRef = collection(db, 'forms');
    onSnapshot(formsRef, (snapshot) => {
        // When tasks change, refresh the entire user progress section
        fetchAndDisplayUserProgress();
    });
}
