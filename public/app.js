// Global variables
let currentUser = null;
let currentChatId = null;
let authToken = null;

// API Base URL
const API_BASE = '/api';

// Test function for debugging
window.testButtonVisibility = function() {
    console.log('🧪 Testing button visibility...');
    const authButtons = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');
    
    console.log('Auth buttons element:', authButtons);
    console.log('User info element:', userInfo);
    console.log('Auth buttons computed style:', window.getComputedStyle(authButtons).display);
    console.log('User info computed style:', window.getComputedStyle(userInfo).display);
    console.log('Auth buttons inline style:', authButtons.style.display);
    console.log('User info inline style:', userInfo.style.display);
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Page loaded, initializing...');
    
    // Hide initial loading screen
    const initialLoading = document.getElementById('initial-loading');
    if (initialLoading) {
        initialLoading.style.display = 'none';
    }
    
    // Set initial state to unauthenticated
    showUnauthenticatedUI();
    checkAuthStatus();
    setupEventListeners();
});

// Check if user is authenticated
async function checkAuthStatus() {
    console.log('🔍 Checking authentication status...');
    const token = localStorage.getItem('authToken');
    if (token) {
        console.log('🔑 Token found, validating...');
        try {
            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                authToken = token;
                console.log('✅ User authenticated:', currentUser.username);
                showAuthenticatedUI();
                loadChatHistory();
                
                // Check if there's a saved chat ID to restore
                const savedChatId = localStorage.getItem('currentChatId');
                if (savedChatId) {
                    console.log('🔄 Restoring chat:', savedChatId);
                    // Small delay to ensure chat history is loaded first
                    setTimeout(async () => {
                        try {
                            await loadChat(savedChatId);
                        } catch (error) {
                            console.log('❌ Failed to restore chat, clearing saved ID');
                            localStorage.removeItem('currentChatId');
                        }
                    }, 100);
                }
            } else {
                console.log('❌ Token invalid, logging out');
                localStorage.removeItem('authToken');
                showUnauthenticatedUI();
            }
        } catch (error) {
            console.error('❌ Auth check failed:', error);
            localStorage.removeItem('authToken');
            showUnauthenticatedUI();
        }
    } else {
        console.log('❌ No token found, showing login');
        showUnauthenticatedUI();
    }
}

// Show authenticated UI
function showAuthenticatedUI() {
    console.log('🔐 Showing authenticated UI');
    
    const authButtons = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');
    const sidebar = document.querySelector('.sidebar');
    
    console.log('Before change - Auth buttons display:', authButtons.style.display);
    console.log('Before change - User info display:', userInfo.style.display);
    
    authButtons.style.setProperty('display', 'none', 'important');
    userInfo.style.setProperty('display', 'flex', 'important');
    
    // Show sidebar when logged in - remove hidden class
    if (sidebar) {
        sidebar.classList.remove('hidden');
    }
    
    console.log('After change - Auth buttons display:', authButtons.style.display);
    console.log('After change - User info display:', userInfo.style.display);
    
    document.getElementById('welcome-text').textContent = `Welcome, ${currentUser.username}!`;
    console.log('✅ Auth buttons hidden, user info shown, sidebar shown');
}

// Show unauthenticated UI
function showUnauthenticatedUI() {
    console.log('🚪 Showing unauthenticated UI');
    
    const authButtons = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');
    const sidebar = document.querySelector('.sidebar');
    
    console.log('Before change - Auth buttons display:', authButtons.style.display);
    console.log('Before change - User info display:', userInfo.style.display);
    
    authButtons.style.setProperty('display', 'flex', 'important');
    userInfo.style.setProperty('display', 'none', 'important');
    
    // Hide sidebar when not logged in - add hidden class
    if (sidebar) {
        sidebar.classList.add('hidden');
    }
    
    console.log('After change - Auth buttons display:', authButtons.style.display);
    console.log('After change - User info display:', userInfo.style.display);
    
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
    console.log('✅ Auth buttons shown, user info hidden, sidebar hidden');
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Register form
    document.getElementById('register-form').addEventListener('submit', handleRegister);
}

// Show login modal
function showLoginModal() {
    const modal = new bootstrap.Modal(document.getElementById('loginModal'));
    modal.show();
}

// Show register modal
function showRegisterModal() {
    const modal = new bootstrap.Modal(document.getElementById('registerModal'));
    modal.show();
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        showLoading(true);
        
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            
            console.log('✅ Login successful, showing authenticated UI');
            showAuthenticatedUI();
            loadChatHistory();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
            modal.hide();
            
            showAlert('Login successful!', 'success');
        } else {
            showAlert(data.error || 'Login failed', 'danger');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed. Please try again.', 'danger');
    } finally {
        showLoading(false);
    }
}

// Handle register
async function handleRegister(e) {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('register-username').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value,
        firstName: document.getElementById('register-firstname').value,
        lastName: document.getElementById('register-lastname').value
    };
    
    try {
        showLoading(true);
        
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            
            showAuthenticatedUI();
            loadChatHistory();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
            modal.hide();
            
            showAlert('Registration successful!', 'success');
        } else {
            if (data.errors) {
                const errorMessages = data.errors.map(err => err.msg).join(', ');
                showAlert(errorMessages, 'danger');
            } else {
                showAlert(data.error || 'Registration failed', 'danger');
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('Registration failed. Please try again.', 'danger');
    } finally {
        showLoading(false);
    }
}

// Logout
function logout() {
    console.log('🚪 Logging out...');
    currentUser = null;
    authToken = null;
    currentChatId = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentChatId');
    
    // Force page refresh to clear any cached state
    window.location.reload();
}

// Load chat history
async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE}/chat`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayChatList(data.chats);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Display chat list
function displayChatList(chats) {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';
    
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.onclick = (e) => {
            // Don't load chat if delete button was clicked
            if (!e.target.classList.contains('delete-chat-btn')) {
                loadChat(chat.id);
            }
        };
        
        const title = document.createElement('div');
        title.className = 'chat-item-title';
        title.textContent = chat.title;
        
        const time = document.createElement('div');
        time.className = 'chat-item-time';
        time.textContent = formatDate(chat.updatedAt);
        time.title = new Date(chat.updatedAt).toLocaleString(); // Tooltip with full date and time
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent chat loading
            deleteChat(chat.id);
        };
        
        chatItem.appendChild(title);
        chatItem.appendChild(time);
        chatItem.appendChild(deleteBtn);
        chatList.appendChild(chatItem);
    });
}

// Create new chat
async function createNewChat() {
    if (!authToken) {
        showLoginModal();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ title: 'New Chat' })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentChatId = data.chat.id;
            
            showChatContainer();
            clearMessages();
            
            // Set the chat title to "New Chat"
            document.getElementById('chat-title').textContent = 'New Chat';
            
            loadChatHistory();
            
            // Focus on input
            document.getElementById('message-input').focus();
        }
    } catch (error) {
        console.error('Error creating chat:', error);
        showAlert('Failed to create new chat', 'danger');
    }
}

// Load specific chat
async function loadChat(chatId) {
    try {
        const response = await fetch(`${API_BASE}/chat/${chatId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentChatId = chatId;
            
            // Save current chat ID to localStorage
            localStorage.setItem('currentChatId', chatId);
            
            showChatContainer();
            displayMessages(data.chat.messages);
            document.getElementById('chat-title').textContent = data.chat.title;
            
            
            // Update active chat in sidebar
            updateActiveChat(chatId);
        }
    } catch (error) {
        console.error('Error loading chat:', error);
        showAlert('Failed to load chat', 'danger');
    }
}

// Show chat container
function showChatContainer() {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    // Ensure any typing indicators are hidden when showing chat
    hideTypingIndicator();
}

// Show welcome screen
function showWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
    // Reset chat title when going back to welcome screen
    document.getElementById('chat-title').textContent = 'New Chat';
    // Clear saved chat ID
    localStorage.removeItem('currentChatId');
}

// Delete chat by ID
async function deleteChat(chatId) {
    if (!confirm('Are you sure you want to delete this chat? This action cannot be undone.')) {
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch(`${API_BASE}/chat/${chatId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            showAlert('Chat deleted successfully', 'success');
            
            // If the deleted chat was currently open, show welcome screen
            if (currentChatId === chatId) {
                currentChatId = null;
                localStorage.removeItem('currentChatId');
                showWelcomeScreen();
            }
            
            // Refresh chat history
            loadChatHistory();
        } else {
            const errorData = await response.json();
            showAlert(errorData.error || 'Failed to delete chat', 'danger');
        }
    } catch (error) {
        console.error('Error deleting chat:', error);
        showAlert('An error occurred while deleting chat', 'danger');
    } finally {
        showLoading(false);
    }
}

// Display messages
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    
    // Ensure no typing indicators are present
    hideTypingIndicator();
    
    messages.forEach(message => {
        addMessageToUI(message.content, message.role);
    });
    
    scrollToBottom();
}

// Add message to UI
function addMessageToUI(content, role) {
    const messagesContainer = document.getElementById('messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Format the content for better display
    if (role === 'assistant') {
        contentDiv.innerHTML = formatMessageContent(content);
    } else {
        contentDiv.textContent = content;
    }
    
    if (role === 'user') {
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
    }
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Format message content for better display
function formatMessageContent(content) {
    // Clean up the content first - remove extra whitespace
    let formatted = content.trim();
    
    // Remove trailing whitespace from each line
    formatted = formatted.replace(/[ \t]+$/gm, '');
    
    // Remove multiple consecutive line breaks
    formatted = formatted.replace(/\n\s*\n\s*\n+/g, '\n\n');
    
    // Convert **text** to <strong>text</strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *text* to <em>text</em> (but not bullet points)
    formatted = formatted.replace(/(?<!^\s*)\*([^*\n]+?)\*(?!\*)/gm, '<em>$1</em>');
    
    // Handle bullet points and numbered lists
    const lines = formatted.split('\n');
    const processedLines = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            continue;
        }
        
        // Check if this is a bullet point
        if (line.match(/^\*\s/)) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            processedLines.push(`<li>${line.substring(2).trim()}</li>`);
        }
        // Check if this is a numbered list
        else if (line.match(/^\d+\.\s/)) {
            if (!inList) {
                processedLines.push('<ul>');
                inList = true;
            }
            processedLines.push(`<li>${line.replace(/^\d+\.\s/, '').trim()}</li>`);
        }
        // Regular line
        else {
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            processedLines.push(`<p>${line}</p>`);
        }
    }
    
    // Close any open list
    if (inList) {
        processedLines.push('</ul>');
    }
    
    // Join all lines
    formatted = processedLines.join('\n');
    
    // Final cleanup - remove any remaining extra whitespace
    formatted = formatted.replace(/\s+$/gm, '');
    formatted = formatted.replace(/\n\s*\n/g, '\n');
    formatted = formatted.replace(/<p>\s*<\/p>/g, '');
    
    // Remove any trailing whitespace from the entire content
    formatted = formatted.trim();
    
    return formatted;
}


  

// Send message
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content || !authToken) return;
    
    if (!currentChatId) {
        await createNewChat();
    }
    
    // Add user message to UI
    addMessageToUI(content, 'user');
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const response = await fetch(`${API_BASE}/chat/${currentChatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Remove typing indicator
            hideTypingIndicator();
            
            // Add AI response to UI
            addMessageToUI(data.aiMessage.content, 'assistant');
            
            // Update chat title if it's the first message (check by message count)
            const messageCount = document.querySelectorAll('#messages .message').length;
            console.log('Message count:', messageCount);
            console.log('User message ID:', data.userMessage.id);
            console.log('Chat data:', data.chat);
            
            if (messageCount === 2) { // User message + AI response = 2 messages
                // Use the title from the API response (updated by backend)
                if (data.chat && data.chat.title) {
                    console.log('Setting chat title to:', data.chat.title);
                    document.getElementById('chat-title').textContent = data.chat.title;
                } else {
                    // Fallback to generating title locally
                    let title = content.trim();
                    
                    // If message is too long, truncate it intelligently
                    if (title.length > 50) {
                        // Try to cut at a word boundary
                        const truncated = title.substring(0, 47);
                        const lastSpace = truncated.lastIndexOf(' ');
                        if (lastSpace > 20) {
                            title = truncated.substring(0, lastSpace) + '...';
                        } else {
                            title = truncated + '...';
                        }
                    }
                    
                    console.log('Setting chat title to (fallback):', title);
                    document.getElementById('chat-title').textContent = title;
                }
            }
            
            // Reload chat history to update sidebar
            loadChatHistory();
        } else {
            hideTypingIndicator();
            const data = await response.json();
            showAlert(data.error || 'Failed to send message', 'danger');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        showAlert('Failed to send message. Please try again.', 'danger');
    } finally {
        // Ensure typing indicator is always hidden
        hideTypingIndicator();
    }
}

// Handle key press in message input
function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Show typing indicator
function showTypingIndicator() {
    // Remove any existing typing indicator first
    hideTypingIndicator();
    
    const messagesContainer = document.getElementById('messages');
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    
    const dots = document.createElement('div');
    dots.className = 'typing-dots';
    dots.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    
    indicator.appendChild(dots);
    typingDiv.appendChild(avatar);
    typingDiv.appendChild(indicator);
    messagesContainer.appendChild(typingDiv);
    
    scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
    // Remove all typing indicators (in case there are multiple)
    const indicators = document.querySelectorAll('#typing-indicator');
    indicators.forEach(indicator => {
        indicator.remove();
    });
    
    // Also remove any elements with typing-indicator class
    const typingElements = document.querySelectorAll('.typing-indicator');
    typingElements.forEach(element => {
        element.remove();
    });
}

// Update active chat in sidebar
function updateActiveChat(chatId) {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        item.classList.remove('active');
        if (item.onclick && item.onclick.toString().includes(chatId)) {
            item.classList.add('active');
        }
    });
}

// Clear messages
function clearMessages() {
    document.getElementById('messages').innerHTML = '';
}

// Clear chat list
function clearChatList() {
    document.getElementById('chat-list').innerHTML = '';
}

// Scroll to bottom
function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show loading spinner
function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    spinner.style.display = show ? 'block' : 'none';
}

// Show alert
function showAlert(message, type) {
    const alertContainer = document.getElementById('alert-container');
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    
    // Reset time to start of day for accurate day comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today - chatDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        // Today - show time
        return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        // Yesterday - show time
        return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays <= 7) {
        // Within a week - show day and time
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[date.getDay()];
        return `${dayName} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        // Older than a week - show full date and time
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}
