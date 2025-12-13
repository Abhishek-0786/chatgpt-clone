// Add Organization Form Module
import { createOrganization, getOrganization, updateOrganization } from '../services/api.js';
import { loadOrganizationsModule } from './organizations.js';
import { showSuccess, showError, showWarning } from '../utils/notifications.js';

// Global variables for document management
let uploadedDocuments = [];

// Export function to open add organization form
export function openAddOrganizationForm() {
    uploadedDocuments = [];
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            .add-organization-container {
                width: 100%;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .form-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
            }
            
            .form-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn {
                padding: 10px 20px;
                background-color: transparent;
                color: #dc3545;
                border: 1px solid #dc3545;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn:hover {
                background-color: #dc3545;
                color: white;
            }
            
            .form-section {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 25px;
                margin-bottom: 25px;
            }
            
            .section-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .section-icon {
                font-size: 20px;
                color: #007bff;
            }
            
            .section-title {
                font-size: 18px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .form-group {
                display: flex;
                flex-direction: column;
            }
            
            .form-group label {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group label .required {
                color: #dc3545;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                padding: 12px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .form-group select {
                padding-right: 40px;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 12px;
            }
            
            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .form-group textarea {
                resize: vertical;
                min-height: 100px;
            }
            
            .form-group.full-width {
                grid-column: 1 / -1;
            }
            
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 20px;
            }
            
            .checkbox-group input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .checkbox-group label {
                margin: 0;
                font-weight: 500;
                cursor: pointer;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .file-upload-area {
                border: 2px dashed var(--border-color);
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                background-color: var(--bg-tertiary);
                cursor: pointer;
                transition: all 0.2s;
                position: relative;
            }
            
            .file-upload-area.logo-upload-area {
                width: 150px;
                height: 150px;
                padding: 15px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            
            .file-upload-area:hover {
                border-color: #007bff;
                background-color: var(--hover-bg);
            }
            
            .file-upload-area.dragover {
                border-color: #007bff;
                background-color: rgba(0,123,255,0.1);
            }
            
            .file-upload-icon {
                font-size: 48px;
                color: #007bff;
                margin-bottom: 15px;
            }
            
            .file-upload-area.logo-upload-area .file-upload-icon {
                font-size: 32px;
                margin-bottom: 10px;
            }
            
            .file-upload-text {
                color: var(--text-primary);
                font-size: 14px;
                margin-bottom: 10px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .file-upload-area.logo-upload-area .file-upload-text {
                font-size: 12px;
                margin-bottom: 5px;
            }
            
            .file-upload-link {
                color: #007bff;
                text-decoration: underline;
                cursor: pointer;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .file-upload-area.logo-upload-area .file-upload-link {
                font-size: 12px;
            }
            
            .file-upload-input {
                display: none;
            }
            
            .logo-preview-container {
                position: relative;
                display: none;
                width: 150px;
                height: 150px;
            }
            
            .logo-preview-container.show {
                display: block;
            }
            
            .preview-image {
                width: 150px;
                height: 150px;
                object-fit: contain;
                border-radius: 8px;
                border: 1px solid var(--border-color);
                display: block;
                background-color: var(--bg-tertiary);
            }
            
            .logo-remove-btn {
                position: absolute;
                top: -10px;
                right: -10px;
                background-color: #dc3545;
                color: white;
                border: 2px solid white;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
                z-index: 10;
            }
            
            .logo-remove-btn:hover {
                background-color: #c82333;
                transform: scale(1.1);
            }
            
            .logo-upload-content {
                display: block;
            }
            
            .logo-upload-content.hidden {
                display: none;
            }
            
            .phone-input-group {
                display: flex;
                gap: 10px;
            }
            
            .country-code-select {
                width: 120px;
                flex-shrink: 0;
            }
            
            .phone-number-input {
                flex: 1;
            }
            
            .document-upload-section {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 20px;
                align-items: start;
                margin-bottom: 20px;
            }
            
            .document-name-input {
                display: flex;
                flex-direction: column;
            }
            
            .document-name-input label {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .document-name-input input {
                padding: 12px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
                width: 100%;
            }
            
            .document-name-input input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .document-upload-area {
                min-height: 120px;
            }
            
            .document-add-button-wrapper {
                grid-column: 1 / -1;
                display: flex;
                justify-content: flex-start;
                margin-top: 10px;
            }
            
            .add-document-btn {
                padding: 12px 30px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 16px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                white-space: nowrap;
            }
            
            .add-document-btn::before {
                content: '+';
                font-size: 22px;
                font-weight: bold;
                margin-right: 6px;
                vertical-align: middle;
                line-height: 1;
            }
            
            .add-document-btn:hover {
                background-color: #c82333;
            }
            
            .add-document-btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            
            .document-preview-container {
                position: relative;
                display: none;
                margin-top: 15px;
            }
            
            .document-preview-small {
                position: relative;
                display: inline-block;
                width: 120px;
                height: 120px;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                background-color: var(--bg-tertiary);
            }
            
            .document-preview-image-small {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }
            
            .document-file-info-small {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                padding: 10px;
            }
            
            .document-file-info-small i {
                font-size: 32px;
                color: #007bff;
                margin-bottom: 5px;
            }
            
            .document-preview-name-small {
                font-size: 10px;
                color: var(--text-primary);
                word-break: break-word;
                text-align: center;
            }
            
            .document-remove-preview-btn-small {
                position: absolute;
                top: 5px;
                right: 5px;
                background-color: #dc3545;
                color: white;
                border: 2px solid white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
                z-index: 10;
                padding: 0;
            }
            
            .document-remove-preview-btn-small:hover {
                background-color: #c82333;
                transform: scale(1.1);
            }
            
            .documents-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }
            
            .documents-table thead {
                background-color: var(--bg-tertiary);
            }
            
            .documents-table th {
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 14px;
                color: var(--text-primary);
                border-bottom: 2px solid var(--border-color);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .documents-table td {
                padding: 12px;
                border-bottom: 1px solid var(--border-color);
                font-size: 14px;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .documents-table tbody tr:hover {
                background-color: var(--hover-bg);
            }
            
            .action-btn {
                background: none;
                border: none;
                color: #dc3545;
                cursor: pointer;
                font-size: 16px;
                padding: 5px 10px;
                transition: color 0.2s;
            }
            
            .action-btn:hover {
                color: #c82333;
            }
            
            .form-actions {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid var(--border-color);
            }
            
            .save-btn {
                padding: 12px 30px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 16px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .save-btn:hover {
                background-color: #c82333;
            }
            
            .save-btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
        </style>
        
        <div class="add-organization-container">
            <div class="form-header">
                <h2>Add New Organization</h2>
                <button class="cancel-btn" onclick="window.cancelAddOrganization()">CANCEL</button>
            </div>
            
            <form id="addOrganizationForm" onsubmit="window.handleAddOrganizationSubmit(event)" enctype="multipart/form-data">
                <!-- Basic Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-building section-icon"></i>
                        <h3 class="section-title">Basic Details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Organization Name<span class="required">*</span></label>
                            <input type="text" name="organizationName" id="organizationName" placeholder="Enter the name here" required>
                        </div>
                        <div class="form-group">
                            <label>GSTIN</label>
                            <input type="text" name="gstin" placeholder="Enter the GST Number here">
                        </div>
                        <div class="form-group">
                            <label>Organization type<span class="required">*</span></label>
                            <select name="organizationType" required>
                                <option value="" disabled selected hidden>Organization type*</option>
                                <option value="1C">1C</option>
                                <option value="FRANCHISE">FRANCHISE</option>
                                <option value="CPO">CPO</option>
                                <option value="OCPI">OCPI</option>
                                <option value="PROPERTY">PROPERTY</option>
                                <option value="HARDWARE">HARDWARE</option>
                                <option value="ELECTRICITY">ELECTRICITY</option>
                                <option value="AGENT">AGENT</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Organization logo (optional)</label>
                            <div class="file-upload-area logo-upload-area" id="logoUploadArea" onclick="document.getElementById('logoFileInput').click()">
                                <div class="logo-upload-content" id="logoUploadContent">
                                    <i class="fas fa-cloud-upload-alt file-upload-icon"></i>
                                    <div class="file-upload-text">Drop your images here or select</div>
                                    <a class="file-upload-link" onclick="event.stopPropagation(); document.getElementById('logoFileInput').click()">click to browse</a>
                                </div>
                                <input type="file" id="logoFileInput" name="organizationLogo" class="file-upload-input" accept="image/*" onchange="window.handleLogoUpload(event)">
                            </div>
                            <div class="logo-preview-container" id="logoPreviewContainer">
                                <img id="logoPreview" class="preview-image" alt="Logo preview">
                                <button type="button" class="logo-remove-btn" onclick="window.removeLogo()" title="Remove logo">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Contact Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-address-card section-icon"></i>
                        <h3 class="section-title">Contact Details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Contact Number<span class="required">*</span></label>
                            <div class="phone-input-group">
                                <select name="countryCode" class="country-code-select" id="countryCodeSelect">
                                    <option value="+91" selected>🇮🇳 +91</option>
                                    <option value="+1">🇺🇸 +1</option>
                                    <option value="+44">🇬🇧 +44</option>
                                    <option value="+86">🇨🇳 +86</option>
                                    <option value="+81">🇯🇵 +81</option>
                                    <option value="+49">🇩🇪 +49</option>
                                    <option value="+33">🇫🇷 +33</option>
                                    <option value="+61">🇦🇺 +61</option>
                                    <option value="+971">🇦🇪 +971</option>
                                    <option value="+65">🇸🇬 +65</option>
                                </select>
                                <input type="text" name="contactNumber" class="phone-number-input" placeholder="Enter the number here" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email<span class="required">*</span></label>
                            <input type="email" name="email" placeholder="Enter the email here" required>
                        </div>
                    </div>
                </div>
                
                <!-- Address Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-map-marker-alt section-icon"></i>
                        <h3 class="section-title">Address Details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Country<span class="required">*</span></label>
                            <select name="addressCountry" required>
                                <option value="" disabled selected hidden>Country*</option>
                                <option value="IN">India</option>
                                <option value="US">United States</option>
                                <option value="GB">United Kingdom</option>
                                <option value="CN">China</option>
                                <option value="JP">Japan</option>
                                <option value="DE">Germany</option>
                                <option value="FR">France</option>
                                <option value="AU">Australia</option>
                                <option value="AE">United Arab Emirates</option>
                                <option value="SG">Singapore</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Pin code<span class="required">*</span></label>
                            <input type="text" name="addressPinCode" placeholder="Enter the pin code here" required>
                        </div>
                        <div class="form-group">
                            <label>City/Town<span class="required">*</span></label>
                            <input type="text" name="addressCity" placeholder="Enter the city/town here" required>
                        </div>
                        <div class="form-group">
                            <label>State<span class="required">*</span></label>
                            <input type="text" name="addressState" placeholder="Enter the state here" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Full Address<span class="required">*</span></label>
                            <textarea name="fullAddress" placeholder="Enter the full address here" required></textarea>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-credit-card section-icon"></i>
                        <h3 class="section-title">Payment details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Bank account number</label>
                            <input type="text" name="bankAccountNumber" placeholder="Enter the name here">
                        </div>
                        <div class="form-group">
                            <label>IFSC code</label>
                            <input type="text" name="ifscCode" placeholder="Enter the name here">
                        </div>
                    </div>
                </div>
                
                <!-- Billing Address Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-map-marker-alt section-icon"></i>
                        <h3 class="section-title">Billing address</h3>
                    </div>
                    <div class="checkbox-group">
                        <input type="checkbox" id="billingSameAsCompany" name="billingSameAsCompany" onchange="window.toggleBillingAddress()">
                        <label for="billingSameAsCompany">Same as organization address</label>
                    </div>
                    <div id="billingAddressFields">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Country<span class="required">*</span></label>
                                <select name="billingCountry" id="billingCountry" required>
                                    <option value="" disabled selected hidden>Country*</option>
                                    <option value="IN">India</option>
                                    <option value="US">United States</option>
                                    <option value="GB">United Kingdom</option>
                                    <option value="CN">China</option>
                                    <option value="JP">Japan</option>
                                    <option value="DE">Germany</option>
                                    <option value="FR">France</option>
                                    <option value="AU">Australia</option>
                                    <option value="AE">United Arab Emirates</option>
                                    <option value="SG">Singapore</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Pin code<span class="required">*</span></label>
                                <input type="text" name="billingPinCode" id="billingPinCode" placeholder="Enter the pin code here" required>
                            </div>
                            <div class="form-group">
                                <label>City/Town<span class="required">*</span></label>
                                <input type="text" name="billingCity" id="billingCity" placeholder="Enter the city/town here" required>
                            </div>
                            <div class="form-group">
                                <label>State<span class="required">*</span></label>
                                <input type="text" name="billingState" id="billingState" placeholder="Enter the state here" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group full-width">
                                <label>Full Address<span class="required">*</span></label>
                                <textarea name="billingFullAddress" id="billingFullAddress" placeholder="Enter the full address here" required></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Documents Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-file-alt section-icon"></i>
                        <h3 class="section-title">Documents (optional)</h3>
                    </div>
                    <div class="document-upload-section">
                        <div class="document-name-input">
                            <label>Document Name</label>
                            <input type="text" id="documentNameInput" placeholder="Enter Document Name">
                        </div>
                        <div class="document-upload-area">
                            <div class="file-upload-area" id="documentUploadArea" onclick="document.getElementById('documentFileInput').click()">
                                <i class="fas fa-cloud-upload-alt file-upload-icon"></i>
                                <div class="file-upload-text">Upload your document</div>
                                <a class="file-upload-link" onclick="event.stopPropagation(); document.getElementById('documentFileInput').click()">click to browse</a>
                                <input type="file" id="documentFileInput" class="file-upload-input" accept="image/*,.pdf,.doc,.docx" onchange="window.handleDocumentFileSelect(event)">
                            </div>
                            <div id="documentPreviewContainer" class="document-preview-container" style="display: none;"></div>
                        </div>
                        <div class="document-add-button-wrapper">
                            <button type="button" class="add-document-btn" onclick="window.addDocument()">ADD</button>
                        </div>
                    </div>
                    <table class="documents-table" id="documentsTable" style="display: none;">
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Date</th>
                                <th>Document Name</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="documentsTableBody">
                        </tbody>
                    </table>
                </div>
                
                <div class="form-actions">
                    <button type="submit" class="save-btn" id="saveOrganizationBtn">ADD ORGANIZATION</button>
                </div>
            </form>
        </div>
    `;
    
    // Initialize drag and drop
    initializeDragAndDrop();
    
    // Setup global functions
    setupGlobalFunctions();
}

// Setup global functions
function setupGlobalFunctions() {
    window.cancelAddOrganization = cancelAddOrganization;
    window.handleAddOrganizationSubmit = handleAddOrganizationSubmit;
    window.handleLogoUpload = handleLogoUpload;
    window.removeLogo = removeLogo;
    window.handleDocumentFileSelect = handleDocumentFileSelect;
    window.removeDocumentPreview = removeDocumentPreview;
    window.addDocument = addDocument;
    window.removeDocument = removeDocument;
    window.toggleBillingAddress = toggleBillingAddress;
}

// Initialize drag and drop for file uploads
function initializeDragAndDrop() {
    const logoArea = document.getElementById('logoUploadArea');
    const documentArea = document.getElementById('documentUploadArea');
    
    // Logo area drag and drop
    if (logoArea) {
        logoArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logoArea.classList.add('dragover');
        });
        
        logoArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logoArea.classList.remove('dragover');
        });
        
        logoArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logoArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const input = document.getElementById('logoFileInput');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(files[0]);
                input.files = dataTransfer.files;
                handleLogoUpload({ target: input });
            }
        });
    }
    
    // Document area drag and drop
    if (documentArea) {
        documentArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            documentArea.classList.add('dragover');
        });
        
        documentArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            documentArea.classList.remove('dragover');
        });
        
        documentArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            documentArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const input = document.getElementById('documentFileInput');
                const dataTransfer = new DataTransfer();
                // Only take the first file
                dataTransfer.items.add(files[0]);
                input.files = dataTransfer.files;
                handleDocumentFileSelect({ target: input });
            }
        });
    }
}

// Handle logo upload
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('logoPreview');
            const previewContainer = document.getElementById('logoPreviewContainer');
            const uploadContent = document.getElementById('logoUploadContent');
            const uploadArea = document.getElementById('logoUploadArea');
            
            preview.src = e.target.result;
            previewContainer.classList.add('show');
            uploadContent.classList.add('hidden');
            uploadArea.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

// Remove logo
// Global flag to track if logo should be removed
let logoRemoved = false;

function removeLogo() {
    const previewContainer = document.getElementById('logoPreviewContainer');
    const uploadContent = document.getElementById('logoUploadContent');
    const uploadArea = document.getElementById('logoUploadArea');
    const fileInput = document.getElementById('logoFileInput');
    
    previewContainer.classList.remove('show');
    uploadContent.classList.remove('hidden');
    uploadArea.style.display = 'block';
    fileInput.value = ''; // Reset file input
    logoRemoved = true; // Mark logo as removed
}

// Handle document file select - single file only
let selectedDocumentFile = null;
function handleDocumentFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        selectedDocumentFile = null;
        removeDocumentPreview();
        return;
    }
    
    selectedDocumentFile = file;
    renderDocumentPreview();
}

// Render preview for single selected document
function renderDocumentPreview() {
    const previewContainer = document.getElementById('documentPreviewContainer');
    const uploadArea = document.getElementById('documentUploadArea');
    
    if (!previewContainer || !uploadArea) {
        console.error('Document preview container or upload area not found');
        return;
    }
    
    if (!selectedDocumentFile) {
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
        uploadArea.style.display = 'block';
        return;
    }
    
    const file = selectedDocumentFile;
    
    // Hide upload area and show preview
    uploadArea.style.display = 'none';
    previewContainer.style.display = 'block';
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `
                <div class="document-preview-small">
                    <img src="${e.target.result}" class="document-preview-image-small" alt="Preview">
                    <button type="button" class="document-remove-preview-btn-small" onclick="window.removeDocumentPreview()" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        };
        reader.readAsDataURL(file);
    } else {
        previewContainer.innerHTML = `
            <div class="document-preview-small">
                <div class="document-file-info-small">
                    <i class="fas fa-file-alt"></i>
                    <div class="document-preview-name-small">${file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}</div>
                </div>
                <button type="button" class="document-remove-preview-btn-small" onclick="window.removeDocumentPreview()" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }
}

// Remove document preview
function removeDocumentPreview() {
    const previewContainer = document.getElementById('documentPreviewContainer');
    const uploadArea = document.getElementById('documentUploadArea');
    const fileInput = document.getElementById('documentFileInput');
    
    selectedDocumentFile = null;
    
    if (previewContainer) {
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
    }
    
    if (uploadArea) {
        uploadArea.style.display = 'block';
    }
    
    if (fileInput) {
        fileInput.value = '';
    }
}

// Add document to list
function addDocument() {
    try {
        const nameInput = document.getElementById('documentNameInput');
        if (!nameInput) {
            console.error('Document name input not found');
            if (typeof showError === 'function') {
                showError('Document name input not found');
            } else {
                alert('Document name input not found');
            }
            return;
        }
        
        const documentName = nameInput.value.trim();
        
        if (!selectedDocumentFile) {
            if (typeof showError === 'function') {
                showError('Please select a document file');
            } else {
                alert('Please select a document file');
            }
            return;
        }
        
        if (!documentName) {
            if (typeof showError === 'function') {
                showError('Please enter a document name');
            } else {
                alert('Please enter a document name');
            }
            return;
        }
        
        const docItem = {
            id: Date.now(),
            file: selectedDocumentFile,
            name: documentName,
            date: new Date().toLocaleDateString()
        };
        
        uploadedDocuments.push(docItem);
        renderDocumentsTable();
        
        // Reset everything - clear preview, show upload area again, clear inputs
        selectedDocumentFile = null;
        nameInput.value = '';
        
        const previewContainer = document.getElementById('documentPreviewContainer');
        const uploadArea = document.getElementById('documentUploadArea');
        const fileInput = document.getElementById('documentFileInput');
        
        if (previewContainer) {
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
        }
        
        if (uploadArea) {
            uploadArea.style.display = 'block';
        }
        
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Scroll to show the added document in the table
        const documentsTable = document.getElementById('documentsTable');
        if (documentsTable && documentsTable.style.display !== 'none') {
            documentsTable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (error) {
        console.error('Error in addDocument:', error);
        if (typeof showError === 'function') {
            showError('An error occurred while adding the document: ' + error.message);
        } else {
            alert('An error occurred while adding the document: ' + error.message);
        }
    }
}

// Remove document from list
function removeDocument(id) {
    uploadedDocuments = uploadedDocuments.filter(doc => doc.id !== id);
    renderDocumentsTable();
}

// Render documents table
function renderDocumentsTable() {
    const table = document.getElementById('documentsTable');
    const tbody = document.getElementById('documentsTableBody');
    
    if (uploadedDocuments.length === 0) {
        table.style.display = 'none';
        return;
    }
    
    table.style.display = 'table';
    tbody.innerHTML = uploadedDocuments.map((doc, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${doc.date}</td>
            <td>${doc.name}</td>
            <td>
                <button type="button" class="action-btn" onclick="window.removeDocument(${doc.id})" title="Remove">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Toggle billing address fields
function toggleBillingAddress() {
    const checkbox = document.getElementById('billingSameAsCompany');
    const fields = document.getElementById('billingAddressFields');
    const inputs = fields.querySelectorAll('input, select, textarea');
    
    if (checkbox.checked) {
        // Copy organization address to billing address
        const organizationCountry = document.querySelector('select[name="addressCountry"]').value;
        const organizationPinCode = document.querySelector('input[name="addressPinCode"]').value;
        const organizationCity = document.querySelector('input[name="addressCity"]').value;
        const organizationState = document.querySelector('input[name="addressState"]').value;
        const organizationAddress = document.querySelector('textarea[name="fullAddress"]').value;
        
        document.getElementById('billingCountry').value = organizationCountry;
        document.getElementById('billingPinCode').value = organizationPinCode;
        document.getElementById('billingCity').value = organizationCity;
        document.getElementById('billingState').value = organizationState;
        document.getElementById('billingFullAddress').value = organizationAddress;
        
        // Disable fields
        inputs.forEach(input => {
            input.disabled = true;
            input.required = false;
        });
    } else {
        // Enable fields
        inputs.forEach(input => {
            input.disabled = false;
            input.required = true;
        });
    }
}

// Cancel add organization
function cancelAddOrganization() {
    loadOrganizationsModule();
}

// Handle form submission
async function handleAddOrganizationSubmit(event) {
    event.preventDefault();
    
    const saveBtn = document.getElementById('saveOrganizationBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';
    
    try {
        const formData = new FormData(event.target);
        
        // Add logo file if exists
        const logoFile = document.getElementById('logoFileInput').files[0];
        if (logoFile) {
            formData.append('organizationLogo', logoFile);
        }
        
        // Add documents
        uploadedDocuments.forEach((doc, index) => {
            formData.append(`documents[${index}][file]`, doc.file);
            formData.append(`documents[${index}][name]`, doc.name);
        });
        
        const response = await createOrganization(formData);
        
        if (response.success) {
            showSuccess('Organization created successfully');
            loadOrganizationsModule();
        } else {
            showError(response.message || 'Failed to create organization');
        }
    } catch (error) {
        console.error('Error creating organization:', error);
        showError(error.message || 'Failed to create organization');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'ADD ORGANIZATION';
    }
}

// Export function to open edit organization form
export async function openEditOrganizationForm(organizationId) {
    try {
        const response = await getOrganization(organizationId);
        if (!response.success || !response.data || !response.data.organization) {
            showError('Failed to load organization data');
            return;
        }
        
        const org = response.data.organization;
        
        // Open the add form first
        openAddOrganizationForm();
        
        // Wait for DOM to be ready, then fill in the values
        setTimeout(() => {
            fillEditFormData(org, organizationId);
        }, 200);
        
    } catch (error) {
        console.error('Error opening edit organization form:', error);
        showError(error.message || 'Failed to load organization data');
    }
}

// Fill form data for edit
function fillEditFormData(org, organizationId) {
    // Reset logo removal flag when loading edit form
    logoRemoved = false;
    
    // Change form title and submit button
    const formHeader = document.querySelector('.form-header h2');
    if (formHeader) {
        formHeader.textContent = 'Edit Organization';
    }
    
    const form = document.getElementById('addOrganizationForm');
    if (form) {
        form.id = 'editOrganizationForm';
        form.onsubmit = (e) => {
            e.preventDefault();
            handleUpdateOrganizationSubmit(e, organizationId);
        };
    }
    
    const saveBtn = document.getElementById('saveOrganizationBtn');
    if (saveBtn) {
        saveBtn.textContent = 'UPDATE ORGANIZATION';
    }
    
    // Fill in all form fields
    if (org.organizationName) {
        const input = document.getElementById('organizationName');
        if (input) input.value = org.organizationName;
    }
    
    if (org.gstin) {
        const input = document.querySelector('input[name="gstin"]');
        if (input) input.value = org.gstin;
    }
    
    if (org.organizationType) {
        const select = document.querySelector('select[name="organizationType"]');
        if (select) select.value = org.organizationType;
    }
    
    if (org.organizationLogo) {
        const preview = document.getElementById('logoPreview');
        const previewContainer = document.getElementById('logoPreviewContainer');
        const uploadContent = document.getElementById('logoUploadContent');
        const uploadArea = document.getElementById('logoUploadArea');
        
        if (preview && previewContainer) {
            preview.src = org.organizationLogo;
            previewContainer.classList.add('show');
            uploadContent.classList.add('hidden');
            uploadArea.style.display = 'none';
        }
    }
    
    if (org.countryCode) {
        const select = document.getElementById('countryCodeSelect');
        if (select) select.value = org.countryCode;
    }
    
    if (org.contactNumber) {
        const input = document.querySelector('input[name="contactNumber"]');
        if (input) input.value = org.contactNumber;
    }
    
    if (org.email) {
        const input = document.querySelector('input[name="email"]');
        if (input) input.value = org.email;
    }
    
    if (org.addressCountry) {
        const select = document.querySelector('select[name="addressCountry"]');
        if (select) select.value = org.addressCountry;
    }
    
    if (org.addressPinCode) {
        const input = document.querySelector('input[name="addressPinCode"]');
        if (input) input.value = org.addressPinCode;
    }
    
    if (org.addressCity) {
        const input = document.querySelector('input[name="addressCity"]');
        if (input) input.value = org.addressCity;
    }
    
    if (org.addressState) {
        const input = document.querySelector('input[name="addressState"]');
        if (input) input.value = org.addressState;
    }
    
    if (org.fullAddress) {
        const textarea = document.querySelector('textarea[name="fullAddress"]');
        if (textarea) textarea.value = org.fullAddress;
    }
    
    if (org.bankAccountNumber) {
        const input = document.querySelector('input[name="bankAccountNumber"]');
        if (input) input.value = org.bankAccountNumber;
    }
    
    if (org.ifscCode) {
        const input = document.querySelector('input[name="ifscCode"]');
        if (input) input.value = org.ifscCode;
    }
    
    
    if (org.billingSameAsCompany) {
        const checkbox = document.getElementById('billingSameAsCompany');
        if (checkbox) {
            checkbox.checked = org.billingSameAsCompany;
            toggleBillingAddress();
        }
    }
    
    if (org.billingCountry) {
        const select = document.getElementById('billingCountry');
        if (select) select.value = org.billingCountry;
    }
    
    if (org.billingPinCode) {
        const input = document.getElementById('billingPinCode');
        if (input) input.value = org.billingPinCode;
    }
    
    if (org.billingCity) {
        const input = document.getElementById('billingCity');
        if (input) input.value = org.billingCity;
    }
    
    if (org.billingState) {
        const input = document.getElementById('billingState');
        if (input) input.value = org.billingState;
    }
    
    if (org.billingFullAddress) {
        const textarea = document.getElementById('billingFullAddress');
        if (textarea) textarea.value = org.billingFullAddress;
    }
    
    // Load existing documents
    if (org.documents && Array.isArray(org.documents)) {
        uploadedDocuments = org.documents.map((doc, index) => ({
            id: doc.id || Date.now() + index,
            name: doc.name,
            date: doc.date || new Date().toLocaleDateString(),
            path: doc.path
        }));
        renderDocumentsTable();
    }
}

// Handle update organization submit
async function handleUpdateOrganizationSubmit(event, organizationId) {
    event.preventDefault();
    
    const saveBtn = document.getElementById('saveOrganizationBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'UPDATING...';
    
    try {
        const formData = new FormData(event.target);
        
        // Handle logo - if removed, send empty string, if new file, send file, otherwise don't send
        const logoFile = document.getElementById('logoFileInput').files[0];
        if (logoRemoved) {
            // Logo was removed - send empty string to indicate removal
            formData.append('removeLogo', 'true');
        } else if (logoFile) {
            // New logo file uploaded
            formData.append('organizationLogo', logoFile);
        }
        
        // Add documents - if empty array, send empty array to clear all documents
        if (uploadedDocuments.length === 0) {
            formData.append('clearDocuments', 'true');
        } else {
            uploadedDocuments.forEach((doc, index) => {
                if (doc.file) {
                    formData.append(`documents[${index}][file]`, doc.file);
                }
                formData.append(`documents[${index}][name]`, doc.name);
                if (doc.path) {
                    formData.append(`documents[${index}][path]`, doc.path);
                }
            });
        }
        
        const response = await updateOrganization(organizationId, formData);
        
        if (response.success) {
            showSuccess('Organization updated successfully');
            
            // Check if we came from organization detail page by checking history state or URL
            const historyState = window.history.state;
            const currentPath = window.location.pathname;
            const isFromDetailPage = (historyState && historyState.organizationId) || 
                                    (currentPath.includes('/organizations/') && currentPath.split('/').length >= 4);
            
            if (isFromDetailPage) {
                // Navigate back to organization detail page
                const url = `/cms/organizations/${organizationId}/details`;
                window.history.pushState({ module: 'organizations', organizationId, tab: 'details' }, '', url);
                
                // Import and load organization detail view
                import('./organization-detail-view.js').then(detailModule => {
                    detailModule.loadOrganizationDetailView(organizationId, 'details');
                }).catch(error => {
                    console.error('Error loading organization detail:', error);
                    loadOrganizationsModule();
                });
            } else {
                // Navigate back to organizations list
                loadOrganizationsModule();
            }
        } else {
            showError(response.message || 'Failed to update organization');
        }
    } catch (error) {
        console.error('Error updating organization:', error);
        showError(error.message || 'Failed to update organization');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'UPDATE ORGANIZATION';
    }
}

