console.log('app.js is loading');

const SUPABASE_URL = 'https://nqrzfkanbotheicyyxni.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xcnpma2FuYm90aGVpY3l5eG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTY1MDMsImV4cCI6MjA4NTc5MjUwM30.Vaj-v83d4_djSridoaYk_vpOZGctccChE4wmaI7kxYQ';

// Admin credentials
const ADMIN_EMAIL = 'shmikie@gmail.com';
const ADMIN_PASSWORD = 'admin123';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global state
let currentUser = null;
let currentTeam = null;
let isAdmin = false;
let selectedChallenge = null;
let selectedTeamForReset = null;

// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    
    // Set up form listeners
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    document.getElementById('uploadForm').addEventListener('submit', handlePhotoUpload);
    document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
    document.getElementById('adminResetPasswordForm').addEventListener('submit', handleAdminResetPassword);
    document.getElementById('setNewPasswordForm').addEventListener('submit', handleSetNewPassword);
    
    // Set up icon selector
    setupIconSelector();
    
    // Check for password reset (if user clicked reset link in email)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
        // User clicked password reset link - show set new password modal
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('setNewPasswordModal').classList.remove('hidden');
        return;
    }
    
    // Check if user is already logged in
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        // Check if user chose to be remembered
        const shouldRemember = sessionStorage.getItem('staySignedIn');
        
        if (shouldRemember === null) {
            // No flag means session expired (new browser session)
            // Sign them out since they didn't choose "Remember Me"
            await supabaseClient.auth.signOut();
            console.log('Session expired - user not remembered');
        } else {
            // User is remembered, proceed with login
            currentUser = user;
            await initializeApp();
        }
    }
});

// ======================
// AUTHENTICATION
// ======================
function setupIconSelector() {
    const iconOptions = document.querySelectorAll('.icon-option');
    const selectedIconInput = document.getElementById('selectedIcon');
    
    iconOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all
            iconOptions.forEach(opt => opt.classList.remove('active'));
            // Add active class to clicked
            option.classList.add('active');
            // Update hidden input
            selectedIconInput.value = option.dataset.icon;
        });
    });
    
    // Set first icon as default active
    if (iconOptions.length > 0) {
        iconOptions[0].classList.add('active');
    }
}

function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabs = document.querySelectorAll('.tab-btn');
    
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
    
    document.getElementById('authMessage').textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    showAuthMessage('Logging in...', false);
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        
        // Set session persistence flag
        if (rememberMe) {
            // Mark that user wants to stay signed in
            sessionStorage.setItem('staySignedIn', 'true');
        } else {
            // Don't set the flag - session will be cleared on browser close
            sessionStorage.setItem('staySignedIn', 'session-only');
        }
        currentUser = data.user;
        await initializeApp();
        
    } catch (error) {
        showAuthMessage('Login failed: ' + error.message, true);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const teamName = document.getElementById('signupTeamName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const icon = document.getElementById('selectedIcon').value;
    
    showAuthMessage('Creating team...', false);
    
    try {
        // Create auth user
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password
        });
        
        if (authError) throw authError;
        
        // Create team entry in database
        const { error: teamError } = await supabaseClient
            .from('teams')
            .insert([
                { email, team_name: teamName, points: 0, icon: icon }
            ]);
        
        if (teamError) throw teamError;
        
        showAuthMessage('Team created! You can now login.', false);
        setTimeout(() => switchTab('login'), 2000);
        
    } catch (error) {
        showAuthMessage('Signup failed: ' + error.message, true);
    }
}

function showAdminLogin() {
    const email = prompt('Admin Email:');
    const password = prompt('Admin Password:');
    
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        isAdmin = true;
        sessionStorage.setItem('staySignedIn', 'true'); // Admin always stays signed in
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('adminScreen').classList.remove('hidden');
        updateUserInfo('Admin');
        loadPendingSubmissions();
    } else {
        alert('Invalid admin credentials!');
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    sessionStorage.removeItem('staySignedIn'); // Clear the persistence flag
    currentUser = null;
    currentTeam = null;
    isAdmin = false;
    
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('adminScreen').classList.add('hidden');
    document.getElementById('userInfo').textContent = '';
    
    // Clear forms
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
}

function showAuthMessage(message, isError) {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
}

// ======================
// APP INITIALIZATION
// ======================
async function initializeApp() {
    // Check if this is admin
    if (currentUser.email === ADMIN_EMAIL) {
        isAdmin = true;
        sessionStorage.setItem('staySignedIn', 'true'); // Admin always stays signed in
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('adminScreen').classList.remove('hidden');
        updateUserInfo('Admin');
        loadPendingSubmissions();
        return;
    }
    
    // Regular team user
    try {
        const { data, error } = await supabaseClient
            .from('teams')
            .select('*')
            .eq('email', currentUser.email)
            .single();
        
        if (error) {
            console.error('Team query error:', error);
            console.error('Looking for email:', currentUser.email);
            throw error;
        }
        
        if (!data) {
            console.error('No team found for email:', currentUser.email);
            throw new Error('No team record found for this email');
        }
        
        currentTeam = data;
        
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        updateUserInfo(currentTeam.team_name);
        
        loadChallenges();
        loadLeaderboard(false);
        
    } catch (error) {
        console.error('Error loading team:', error);
        showAuthMessage('Error loading team data: ' + error.message, true);
        // Sign them out so they can try again
        await supabaseClient.auth.signOut();
    }
}

function updateUserInfo(name) {
    const icon = currentTeam ? currentTeam.icon || 'Ã°Å¸ÂÂ¯' : '';
    const displayName = currentTeam ? `${icon} ${name}` : name;
    document.getElementById('userInfo').textContent = displayName;
}

// ======================
// NAVIGATION
// ======================
function showSection(section) {
    // Update nav buttons
    const buttons = document.querySelectorAll('#appScreen .nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (section === 'challenges') {
        buttons[0].classList.add('active');
    } else if (section === 'gallery') {
        buttons[1].classList.add('active');
    } else if (section === 'leaderboard') {
        buttons[2].classList.add('active');
    }
    
    // Show selected section
    document.getElementById('challengesSection').classList.add('hidden');
    document.getElementById('gallerySection').classList.add('hidden');
    document.getElementById('leaderboardSection').classList.add('hidden');
    
    if (section === 'challenges') {
        document.getElementById('challengesSection').classList.remove('hidden');
    } else if (section === 'gallery') {
        document.getElementById('gallerySection').classList.remove('hidden');
        loadGallery();
    } else if (section === 'leaderboard') {
        document.getElementById('leaderboardSection').classList.remove('hidden');
        loadLeaderboard(false);
    }
}

function showAdminSection(section) {
    console.log('showAdminSection called:', section);
    
    // Update nav buttons
    const buttons = document.querySelectorAll('#adminScreen .nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (section === 'pending') {
        buttons[0].classList.add('active');
    } else if (section === 'teams') {
        buttons[1].classList.add('active');
    } else if (section === 'manage') {
        buttons[2].classList.add('active');
    } else if (section === 'leaderboard') {
        buttons[3].classList.add('active');
    }
    
    // Show selected section
    document.getElementById('adminPendingSection').classList.add('hidden');
    document.getElementById('adminTeamsSection').classList.add('hidden');
    document.getElementById('adminManageSection').classList.add('hidden');
    document.getElementById('adminLeaderboardSection').classList.add('hidden');
    
    if (section === 'pending') {
        document.getElementById('adminPendingSection').classList.remove('hidden');
        loadPendingSubmissions();
    } else if (section === 'teams') {
        document.getElementById('adminTeamsSection').classList.remove('hidden');
        loadTeamsList();
    } else if (section === 'manage') {
        document.getElementById('adminManageSection').classList.remove('hidden');
        loadManageChallenges();
    } else if (section === 'leaderboard') {
        document.getElementById('adminLeaderboardSection').classList.remove('hidden');
        loadLeaderboard(true);
    }
}

// ======================
// CHALLENGES
// ======================
async function loadChallenges() {
    try {
        // Get all challenges
        const { data: challenges, error: challengesError } = await supabaseClient
            .from('challenges')
            .select('*')
            .order('id');
        
        if (challengesError) throw challengesError;
        
        // Get team's submissions
        const { data: submissions, error: submissionsError } = await supabaseClient
            .from('submissions')
            .select('*')
            .eq('team_email', currentTeam.email);
        
        if (submissionsError) throw submissionsError;
        
        // Create lookup for submissions by challenge_id
        const submissionMap = {};
        submissions.forEach(sub => {
            submissionMap[sub.challenge_id] = sub;
        });
        
        // Render challenges
        const container = document.getElementById('challengesList');
        container.innerHTML = '';
        
        challenges.forEach(challenge => {
            const submission = submissionMap[challenge.id];
            const card = createChallengeCard(challenge, submission);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading challenges:', error);
    }
}

function createChallengeCard(challenge, submission) {
    const card = document.createElement('div');
    card.className = 'challenge-card';
    
    // Add disabled class if challenge is not enabled
    if (!challenge.enabled) {
        card.classList.add('disabled');
    }
    
    let statusHTML = '';
    let buttonHTML = '';
    
    if (!challenge.enabled) {
        // Challenge is disabled/locked
        statusHTML = '<div class="challenge-locked">Ã°Å¸ââ Locked</div>';
        buttonHTML = '<button class="btn-upload" disabled>Locked</button>';
    } else if (submission) {
        if (submission.status === 'pending') {
            statusHTML = '<div class="challenge-status status-pending">Ã¢ÂÂ³ Pending Review</div>';
            buttonHTML = '<button class="btn-upload" disabled>Submitted</button>';
        } else if (submission.status === 'approved') {
            statusHTML = `<div class="challenge-status status-approved">✅ Approved! (+${submission.points_awarded} pts)</div>`;
            buttonHTML = '<button class="btn-upload" disabled>Completed</button>';
        } else if (submission.status === 'rejected') {
            statusHTML = '<div class="challenge-status status-rejected">Ã¢ÂÅ Rejected - Try Again</div>';
            buttonHTML = `<button class="btn-upload" onclick="openUploadModal(${challenge.id}, '${challenge.name}')">Resubmit Photo</button>`;
        }
    } else {
        buttonHTML = `<button class="btn-upload" onclick="openUploadModal(${challenge.id}, '${challenge.name}')">Upload Photo</button>`;
    }
    
    card.innerHTML = `
        <h3>${challenge.name}</h3>
        <p>${challenge.description}</p>
        <span class="challenge-points">Ã°Å¸Ââ  ${challenge.points} base points</span>
        ${statusHTML}
        ${buttonHTML}
    `;
    
    return card;
}

// ======================
// PHOTO UPLOAD
// ======================
function openUploadModal(challengeId, challengeName) {
    selectedChallenge = challengeId;
    document.getElementById('modalTitle').textContent = `Upload Photo: ${challengeName}`;
    document.getElementById('uploadModal').classList.remove('hidden');
    document.getElementById('uploadForm').reset();
    document.getElementById('uploadMessage').textContent = '';
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.add('hidden');
    selectedChallenge = null;
}

async function handlePhotoUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('photoInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showUploadMessage('Please select a photo', true);
        return;
    }
    
    showUploadMessage('Uploading...', false);
    
    try {
        // Upload photo to storage
        const fileName = `${currentTeam.email}_${selectedChallenge}_${Date.now()}.${file.name.split('.').pop()}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('challenge-photos')
            .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('challenge-photos')
            .getPublicUrl(fileName);
        
        // Create submission record
        const { error: submissionError } = await supabaseClient
            .from('submissions')
            .insert([{
                team_email: currentTeam.email,
                challenge_id: selectedChallenge,
                photo_url: publicUrl,
                status: 'pending',
                points_awarded: 0
            }]);
        
        if (submissionError) throw submissionError;
        
        showUploadMessage('Photo uploaded successfully!', false);
        
        setTimeout(() => {
            closeUploadModal();
            loadChallenges();
        }, 1500);
        
    } catch (error) {
        console.error('Upload error:', error);
        showUploadMessage('Upload failed: ' + error.message, true);
    }
}

function showUploadMessage(message, isError) {
    const messageEl = document.getElementById('uploadMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
}

// ======================
// ADMIN - PENDING SUBMISSIONS
// ======================
async function loadPendingSubmissions() {
    try {
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('*, teams(team_name), challenges(name, points)')
            .eq('status', 'pending')
            .order('created_at');
        
        if (error) throw error;
        
        const container = document.getElementById('pendingSubmissions');
        
        if (submissions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">No pending submissions</p>';
            return;
        }
        
        container.innerHTML = '';
        
        submissions.forEach(submission => {
            // Skip submissions from deleted teams
            if (!submission.teams || !submission.challenges) {
                console.warn('Skipping submission with missing team or challenge data:', submission.id);
                return;
            }
            
            const card = createSubmissionCard(submission);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading submissions:', error);
    }
}

function createSubmissionCard(submission) {
    const card = document.createElement('div');
    card.className = 'submission-card';
    
    const teamIcon = submission.teams.icon || 'Ã°Å¸ÂÂ¯';
    
    card.innerHTML = `
        <h4>${submission.challenges.name}</h4>
        <div class="submission-info">
            <p><strong>Team:</strong> ${teamIcon} ${submission.teams.team_name}</p>
            <p><strong>Base Points:</strong> ${submission.challenges.points}</p>
            <p><strong>Submitted:</strong> ${new Date(submission.created_at).toLocaleString()}</p>
        </div>
        <img src="${submission.photo_url}" alt="Submission photo" class="submission-photo" onclick="window.open('${submission.photo_url}', '_blank')">
        <div class="submission-actions">
            <button class="btn-approve" onclick="approveSubmission(${submission.id}, ${submission.challenge_id}, '${submission.team_email}', ${submission.challenges.points})">✅ Approve</button>
            <button class="btn-reject" onclick="rejectSubmission(${submission.id})">Ã¢ÂÅ Reject</button>
        </div>
    `;
    
    return card;
}

async function approveSubmission(submissionId, challengeId, teamEmail, basePoints) {
    try {
        // Get ALL submissions for this challenge (regardless of status) to determine true ranking
        const { data: allSubmissions } = await supabaseClient
            .from('submissions')
            .select('id, created_at, status')
            .eq('challenge_id', challengeId)
            .order('created_at', { ascending: true });
        
        // Find the rank by timestamp (1st submitted = rank 1, 2nd submitted = rank 2, etc.)
        const rank = allSubmissions.findIndex(s => s.id === submissionId) + 1;
        
        // Only first team gets bonus, everyone else gets base points only
        const orderBonus = rank === 1 ? 10 : 0;
        const totalPoints = basePoints + orderBonus;
        
        // Update submission
        const { error: updateError } = await supabaseClient
            .from('submissions')
            .update({
                status: 'approved',
                points_awarded: totalPoints
            })
            .eq('id', submissionId);
        
        if (updateError) throw updateError;
        
        // Update team points
        const { data: team } = await supabaseClient
            .from('teams')
            .select('points')
            .eq('email', teamEmail)
            .single();
        
        await supabaseClient
            .from('teams')
            .update({ points: (team.points || 0) + totalPoints })
            .eq('email', teamEmail);
        
        alert(`Approved! Awarded ${totalPoints} points (${basePoints} base + ${orderBonus} order bonus)`);
        loadPendingSubmissions();
        
    } catch (error) {
        console.error('Error approving:', error);
        alert('Error approving submission');
    }
}

async function rejectSubmission(submissionId) {
    if (!confirm('Are you sure you want to reject this submission?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('submissions')
            .update({ status: 'rejected' })
            .eq('id', submissionId);
        
        if (error) throw error;
        
        alert('Submission rejected');
        loadPendingSubmissions();
        
    } catch (error) {
        console.error('Error rejecting:', error);
        alert('Error rejecting submission');
    }
}

// ======================
// ADMIN - MANAGE CHALLENGES
// ======================
async function loadManageChallenges() {
    console.log('loadManageChallenges called');
    try {
        const { data: challenges, error } = await supabaseClient
            .from('challenges')
            .select('*')
            .order('id');
        
        if (error) throw error;
        
        console.log('Challenges loaded:', challenges);
        
        const container = document.getElementById('manageChallengesList');
        container.innerHTML = '';
        
        if (!challenges || challenges.length === 0) {
            container.innerHTML = '<p>No challenges found</p>';
            return;
        }
        
        challenges.forEach(challenge => {
            const item = document.createElement('div');
            item.className = 'manage-challenge-item';
            
            item.innerHTML = `
                <div class="manage-challenge-info">
                    <h4>${challenge.name}</h4>
                    <p>${challenge.description}</p>
                    <p><strong>Points:</strong> ${challenge.points}</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${challenge.enabled ? 'checked' : ''} 
                           onchange="toggleChallenge(${challenge.id}, this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            `;
            
            container.appendChild(item);
        });
        
    } catch (error) {
        console.error('Error loading challenges:', error);
        alert('Error loading challenges: ' + error.message);
    }
}

async function toggleChallenge(challengeId, enabled) {
    try {
        const { error } = await supabaseClient
            .from('challenges')
            .update({ enabled: enabled })
            .eq('id', challengeId);
        
        if (error) throw error;
        
        alert(enabled ? '✅ Challenge Enabled!' : 'Ã°Å¸ââ Challenge Disabled');
        
    } catch (error) {
        console.error('Error toggling challenge:', error);
        alert('Error updating challenge');
    }
}

// ======================
// ADMIN - ADD NEW CHALLENGE
// ======================
function toggleAddChallengeForm() {
    const form = document.getElementById('addChallengeForm');
    const message = document.getElementById('addChallengeMessage');
    
    if (form.classList.contains('hidden')) {
        form.classList.remove('hidden');
        message.classList.add('hidden');
        // Clear form
        document.getElementById('newChallengeName').value = '';
        document.getElementById('newChallengeDescription').value = '';
        document.getElementById('newChallengePoints').value = '';
        document.getElementById('newChallengeEnabled').checked = false;
    } else {
        form.classList.add('hidden');
    }
}

async function createChallenge() {
    const name = document.getElementById('newChallengeName').value.trim();
    const description = document.getElementById('newChallengeDescription').value.trim();
    const points = parseInt(document.getElementById('newChallengePoints').value);
    const enabled = document.getElementById('newChallengeEnabled').checked;
    
    if (!name || !description || !points) {
        showAddChallengeMessage('Please fill in all fields', true);
        return;
    }
    
    showAddChallengeMessage('Creating challenge...', false);
    
    try {
        const { data, error } = await supabaseClient
            .from('challenges')
            .insert([{
                name: name,
                description: description,
                points: points,
                enabled: enabled
            }])
            .select();
        
        if (error) throw error;
        
        showAddChallengeMessage('✅ Challenge created successfully!', false);
        
        // Hide form after 1.5 seconds and refresh list
        setTimeout(() => {
            toggleAddChallengeForm();
            loadManageChallenges();
        }, 1500);
        
    } catch (error) {
        console.error('Error creating challenge:', error);
        showAddChallengeMessage('Error creating challenge: ' + error.message, true);
    }
}

function showAddChallengeMessage(message, isError) {
    const messageEl = document.getElementById('addChallengeMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
    messageEl.classList.remove('hidden');
}

// ======================
// LEADERBOARD
// ======================
async function loadLeaderboard(isAdminView) {
    try {
        const { data: teams, error } = await supabaseClient
            .from('teams')
            .select('*')
            .order('points', { ascending: false });
        
        if (error) throw error;
        
        const containerId = isAdminView ? 'adminLeaderboardList' : 'leaderboardList';
        const container = document.getElementById(containerId);
        
        container.innerHTML = '';
        
        teams.forEach((team, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            if (index === 0) item.classList.add('first');
            else if (index === 1) item.classList.add('second');
            else if (index === 2) item.classList.add('third');
            
            const rank = index + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
            const teamIcon = team.icon || 'Ã°Å¸ÂÂ¯';
            
            item.innerHTML = `
                <div class="leaderboard-rank">${medal || rank}</div>
                <div class="leaderboard-icon">${teamIcon}</div>
                <div class="leaderboard-name">${team.team_name}</div>
                <div class="leaderboard-points">${team.points} pts</div>
            `;
            
            container.appendChild(item);
        });
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// ======================
// PHOTO GALLERY
// ======================
async function loadGallery() {
    try {
        const { data: submissions, error } = await supabaseClient
            .from('submissions')
            .select('*, teams(team_name), challenges(name, points)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('galleryList');
        
        if (submissions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">No approved submissions yet!</p>';
            return;
        }
        
        container.innerHTML = '';
        
        submissions.forEach(submission => {
            // Skip submissions from deleted teams
            if (!submission.teams || !submission.challenges) {
                console.warn('Skipping submission with missing team or challenge data:', submission.id);
                return;
            }
            
            const card = createGalleryCard(submission);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function createGalleryCard(submission) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    
    const submittedDate = new Date(submission.created_at).toLocaleString();
    const teamIcon = submission.teams.icon || 'Ã°Å¸ÂÂ¯';
    
    card.innerHTML = `
        <img src="${submission.photo_url}" alt="Challenge photo" class="gallery-photo" onclick="window.open('${submission.photo_url}', '_blank')">
        <div class="gallery-info">
            <h4>${submission.challenges.name}</h4>
            <p><strong>Team:</strong> ${teamIcon} ${submission.teams.team_name}</p>
            <p><strong>Points Awarded:</strong> ${submission.points_awarded}</p>
            <p class="gallery-date">Submitted: ${submittedDate}</p>
        </div>
    `;
    
    return card;
}

// ======================
// PASSWORD RESET - TEAM FORGOT PASSWORD
// ======================
function showForgotPassword() {
    document.getElementById('forgotPasswordModal').classList.remove('hidden');
    document.getElementById('forgotPasswordForm').reset();
    document.getElementById('forgotPasswordMessage').textContent = '';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.add('hidden');
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotPasswordEmail').value;
    
    showForgotPasswordMessage('Sending reset link...', false);
    
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        
        if (error) throw error;
        
        showForgotPasswordMessage('â Password reset link sent to your email!', false);
        
        setTimeout(() => {
            closeForgotPasswordModal();
        }, 3000);
        
    } catch (error) {
        console.error('Password reset error:', error);
        showForgotPasswordMessage('Error: ' + error.message, true);
    }
}

function showForgotPasswordMessage(message, isError) {
    const messageEl = document.getElementById('forgotPasswordMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
}

// ======================
// SET NEW PASSWORD (After clicking email link)
// ======================
async function handleSetNewPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showSetNewPasswordMessage('Passwords do not match!', true);
        return;
    }
    
    if (newPassword.length < 6) {
        showSetNewPasswordMessage('Password must be at least 6 characters', true);
        return;
    }
    
    showSetNewPasswordMessage('Updating password...', false);
    
    try {
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        
        showSetNewPasswordMessage('â Password updated successfully!', false);
        
        setTimeout(async () => {
            // Sign out and clear all session data
            await supabaseClient.auth.signOut();
            sessionStorage.removeItem('staySignedIn');
            localStorage.clear();
            
            // Close modal and show login
            document.getElementById('setNewPasswordModal').classList.add('hidden');
            document.getElementById('authScreen').classList.remove('hidden');
            
            // Clear the hash from URL
            window.location.hash = '';
            
            alert('Password updated! You can now log in with your new password.');
        }, 2000);
        
    } catch (error) {
        console.error('Password update error:', error);
        showSetNewPasswordMessage('Error: ' + error.message, true);
    }
}

function showSetNewPasswordMessage(message, isError) {
    const messageEl = document.getElementById('setNewPasswordMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
}

// ======================
// ADMIN - TEAMS MANAGEMENT
// ======================
async function loadTeamsList() {
    try {
        const { data: teams, error } = await supabaseClient
            .from('teams')
            .select('*')
            .order('points', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('teamsList');
        
        if (teams.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">No teams registered yet</p>';
            return;
        }
        
        container.innerHTML = '';
        
        teams.forEach(team => {
            const item = createTeamItem(team);
            container.appendChild(item);
        });
        
    } catch (error) {
        console.error('Error loading teams:', error);
    }
}

function createTeamItem(team) {
    const item = document.createElement('div');
    item.className = 'team-item';
    
    const teamIcon = team.icon || 'ð¯';
    
    item.innerHTML = `
        <div class="team-icon-display">${teamIcon}</div>
        <div class="team-item-info">
            <h4>${team.team_name}</h4>
            <p><strong>Email:</strong> ${team.email}</p>
            <p><strong>Points:</strong> <span class="team-points">${team.points}</span></p>
        </div>
        <button class="btn-reset-password" onclick="openAdminResetPassword('${team.email}', '${team.team_name}')">
            ð Reset Password
        </button>
    `;
    
    return item;
}

// ======================
// ADMIN - PASSWORD RESET
// ======================
function openAdminResetPassword(teamEmail, teamName) {
    selectedTeamForReset = teamEmail;
    document.getElementById('resetTeamName').textContent = teamName;
    document.getElementById('adminResetPasswordModal').classList.remove('hidden');
    document.getElementById('adminResetPasswordForm').reset();
    document.getElementById('adminResetPasswordMessage').textContent = '';
}

function closeAdminResetPasswordModal() {
    document.getElementById('adminResetPasswordModal').classList.add('hidden');
    selectedTeamForReset = null;
}

async function handleAdminResetPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('newTempPassword').value;
    
    if (!selectedTeamForReset) {
        showAdminResetPasswordMessage('Error: No team selected', true);
        return;
    }
    
    showAdminResetPasswordMessage('Resetting password...', false);
    
    try {
        // Note: Supabase doesn't allow direct password updates via client SDK for security
        // We need to use the admin API which requires the service role key
        // For now, we'll show instructions to use the Supabase dashboard
        
        // Alternative approach: Send password reset email
        const { error } = await supabaseClient.auth.resetPasswordForEmail(selectedTeamForReset, {
            redirectTo: window.location.origin
        });
        
        if (error) throw error;
        
        showAdminResetPasswordMessage(
            `â Password reset email sent to ${selectedTeamForReset}\n\nAlternatively, you can reset it in Supabase Dashboard:\n1. Go to Authentication > Users\n2. Find ${selectedTeamForReset}\n3. Click "..." > Reset Password`,
            false
        );
        
        setTimeout(() => {
            closeAdminResetPasswordModal();
        }, 5000);
        
    } catch (error) {
        console.error('Password reset error:', error);
        showAdminResetPasswordMessage('Error: ' + error.message, true);
    }
}

function showAdminResetPasswordMessage(message, isError) {
    const messageEl = document.getElementById('adminResetPasswordMessage');
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
    messageEl.style.whiteSpace = 'pre-line'; // Allow line breaks
}