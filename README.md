# ChatGPT Clone

A full-stack ChatGPT-style web application built with Node.js, Express.js, PostgreSQL, and Bootstrap. Users can register, log in, and chat with an integrated OpenAI LLM. All chat history and user data are securely stored in a PostgreSQL database using Sequelize ORM.

## Features

- 🔐 User authentication (registration/login) with JWT
- 💬 Real-time chat interface with OpenAI integration
- 📚 Persistent chat history stored in PostgreSQL
- 🎨 Modern, responsive UI built with Bootstrap
- 🔒 Secure password hashing with bcrypt
- 📱 Mobile-friendly design
- ⚡ Fast and efficient message handling

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Sequelize** - ORM for database operations
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **Google Gemini API** - LLM integration

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling with custom CSS
- **Bootstrap 5** - UI framework
- **JavaScript (ES6+)** - Client-side logic
- **Font Awesome** - Icons

## Prerequisites

Before running this application, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [PostgreSQL](https://www.postgresql.org/) (v12 or higher)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- Google Gemini API key

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatgpt-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit the `.env` file with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=chatgpt_clone
   DB_USER=your_username
   DB_PASSWORD=your_password

   # JWT Secret
   JWT_SECRET=your_super_secret_jwt_key_here

   # Google Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

4. **Set up PostgreSQL database**
   ```sql
   CREATE DATABASE chatgpt_clone;
   CREATE USER your_username WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE chatgpt_clone TO your_username;
   ```

5. **Run the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Or production mode
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## Usage

### Registration
1. Click the "Register" button in the navigation
2. Fill in the registration form with your details
3. Click "Register" to create your account

### Login
1. Click the "Login" button in the navigation
2. Enter your email and password
3. Click "Login" to access your account

### Chatting
1. After logging in, click "New Chat" to start a conversation
2. Type your message in the input field and press Enter or click the send button
3. The AI will respond using OpenAI's GPT model
4. Your chat history is automatically saved and can be accessed from the sidebar

### Chat Management
- **New Chat**: Click "New Chat" to start a fresh conversation
- **Chat History**: All your previous chats are listed in the sidebar
- **Chat Selection**: Click on any chat in the sidebar to load its history
- **Auto-save**: All messages are automatically saved to the database

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Chat
- `GET /api/chat` - Get all chats for user
- `POST /api/chat` - Create new chat
- `GET /api/chat/:chatId` - Get specific chat with messages
- `POST /api/chat/:chatId/messages` - Send message to chat
- `DELETE /api/chat/:chatId` - Delete chat

## Database Schema

### Users Table
- `id` - Primary key
- `username` - Unique username
- `email` - Unique email address
- `password` - Hashed password
- `firstName` - User's first name
- `lastName` - User's last name
- `createdAt` - Account creation timestamp
- `updatedAt` - Last update timestamp

### Chats Table
- `id` - Primary key
- `userId` - Foreign key to Users table
- `title` - Chat title
- `isActive` - Chat status
- `createdAt` - Chat creation timestamp
- `updatedAt` - Last update timestamp

### Messages Table
- `id` - Primary key
- `chatId` - Foreign key to Chats table
- `role` - Message role (user/assistant)
- `content` - Message content
- `tokens` - Token count for AI responses
- `createdAt` - Message creation timestamp
- `updatedAt` - Last update timestamp

## Security Features

- **Password Hashing**: All passwords are hashed using bcryptjs
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Protection**: Sequelize ORM prevents SQL injection
- **CORS Protection**: Cross-origin resource sharing protection
- **Environment Variables**: Sensitive data stored in environment variables

## Customization

### Styling
The application uses custom CSS in `public/styles.css`. You can modify the color scheme, layout, and styling by editing this file.

### Gemini Model
The default model is `gemini-pro`. You can change this in `routes/chat.js`:

```javascript
const model = genAI.getGenerativeModel({ 
  model: "gemini-pro" // Change to other Gemini models
});
```

### Database
The application uses PostgreSQL with Sequelize. You can modify the database configuration in `config/database.js`.

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Ensure PostgreSQL is running
   - Check database credentials in `.env`
   - Verify database exists

2. **Gemini API Error**
   - Verify your Gemini API key is correct
   - Check if you have sufficient API credits
   - Ensure the API key has the necessary permissions

3. **Port Already in Use**
   - Change the PORT in `.env` file
   - Or kill the process using the port

4. **Module Not Found**
   - Run `npm install` to install dependencies
   - Check if all required packages are installed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please create an issue in the repository or contact the development team.

## Acknowledgments

- Google for providing the Gemini API
- Bootstrap for the UI framework
- The open-source community for various packages used in this project
