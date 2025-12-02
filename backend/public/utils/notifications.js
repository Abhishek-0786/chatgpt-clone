// Beautiful Toast Notification System

/**
 * Show a beautiful toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
    // Remove any existing toast container
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    toast.id = toastId;
    
    // Define colors and icons based on type
    const config = {
        success: {
            bg: '#22c55e',
            icon: '<i class="fas fa-check-circle"></i>',
            border: '#16a34a'
        },
        error: {
            bg: '#ef4444',
            icon: '<i class="fas fa-times-circle"></i>',
            border: '#dc2626'
        },
        warning: {
            bg: '#f59e0b',
            icon: '<i class="fas fa-exclamation-triangle"></i>',
            border: '#d97706'
        },
        info: {
            bg: '#3b82f6',
            icon: '<i class="fas fa-info-circle"></i>',
            border: '#2563eb'
        }
    };

    const style = config[type] || config.info;

    toast.style.cssText = `
        background: linear-gradient(135deg, ${style.bg} 0%, ${style.border} 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        max-width: 450px;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        font-size: 14px;
        font-weight: 500;
        pointer-events: auto;
        animation: slideInRight 0.3s ease-out, fadeOut 0.3s ease-in ${(duration - 300) / 1000}s forwards;
        position: relative;
        overflow: hidden;
    `;

    // Add icon
    const icon = document.createElement('div');
    icon.style.cssText = `
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    `;
    icon.innerHTML = style.icon;

    // Add message
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        flex: 1;
        line-height: 1.5;
    `;
    messageDiv.textContent = message;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = `
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: background 0.2s;
        flex-shrink: 0;
        padding: 0;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    closeBtn.onclick = () => removeToast(toastId);

    // Add progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.5);
        width: 100%;
        transform-origin: left;
        animation: progress ${duration / 1000}s linear forwards;
    `;

    toast.appendChild(icon);
    toast.appendChild(messageDiv);
    toast.appendChild(closeBtn);
    toast.appendChild(progressBar);

    // Add CSS animations if not already added
    if (!document.getElementById('toast-animations')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'toast-animations';
        styleSheet.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateX(100%);
                }
            }
            
            @keyframes progress {
                from {
                    transform: scaleX(1);
                }
                to {
                    transform: scaleX(0);
                }
            }
        `;
        document.head.appendChild(styleSheet);
    }

    toastContainer.appendChild(toast);

    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toastId);
        }, duration);
    }

    return toastId;
}

/**
 * Remove a toast notification
 */
function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => {
            toast.remove();
            // Remove container if empty
            const container = document.getElementById('toast-container');
            if (container && container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }
}

/**
 * Show success notification
 */
export function showSuccess(message, duration = 3000) {
    return showToast(message, 'success', duration);
}

/**
 * Show error notification
 */
export function showError(message, duration = 4000) {
    return showToast(message, 'error', duration);
}

/**
 * Show warning notification
 */
export function showWarning(message, duration = 3500) {
    return showToast(message, 'warning', duration);
}

/**
 * Show info notification
 */
export function showInfo(message, duration = 3000) {
    return showToast(message, 'info', duration);
}

/**
 * Show a beautiful confirmation dialog
 * @param {string} message - The confirmation message
 * @param {string} title - The dialog title (optional)
 * @param {string} confirmText - The confirm button text (optional, default: 'Delete')
 * @returns {Promise<boolean>} - Returns true if confirmed, false if cancelled
 */
export function showConfirm(message, title = 'Confirm Action', confirmText = 'Delete') {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'confirm-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.2s ease-out;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 450px;
            overflow: hidden;
            animation: slideUp 0.3s ease-out;
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 20px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        header.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${title}</h3>
        `;

        // Body
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 24px;
            color: #333;
            line-height: 1.6;
            font-size: 15px;
        `;
        body.textContent = message;

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px 24px;
            background: #f8f9fa;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            border-top: 1px solid #e0e0e0;
        `;

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 10px 24px;
            background: white;
            color: #666;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        `;
        cancelBtn.onmouseover = () => {
            cancelBtn.style.background = '#f8f9fa';
            cancelBtn.style.borderColor = '#d0d0d0';
        };
        cancelBtn.onmouseout = () => {
            cancelBtn.style.background = 'white';
            cancelBtn.style.borderColor = '#e0e0e0';
        };
        cancelBtn.onclick = () => {
            overlay.style.animation = 'fadeOut 0.2s ease-out forwards';
            setTimeout(() => {
                overlay.remove();
                resolve(false);
            }, 200);
        };

        // Confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.style.cssText = `
            padding: 10px 24px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        `;
        confirmBtn.onmouseover = () => {
            confirmBtn.style.transform = 'translateY(-1px)';
            confirmBtn.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
        };
        confirmBtn.onmouseout = () => {
            confirmBtn.style.transform = 'translateY(0)';
            confirmBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        };
        confirmBtn.onclick = () => {
            overlay.style.animation = 'fadeOut 0.2s ease-out forwards';
            setTimeout(() => {
                overlay.remove();
                resolve(true);
            }, 200);
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Add animations if not already added
        if (!document.getElementById('confirm-animations')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'confirm-animations';
            styleSheet.textContent = `
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
                
                @keyframes slideUp {
                    from {
                        transform: translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(styleSheet);
        }

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cancelBtn.click();
            }
        };

        document.body.appendChild(overlay);
    });
}

// Make functions globally available
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;
window.showConfirm = showConfirm;

