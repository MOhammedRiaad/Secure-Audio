# Mobile App API Configuration

The mobile app needs to connect to your backend server. Since mobile devices can't use `localhost`, you need to configure the correct API URL.

## Quick Setup

1. **Find your computer's IP address:**
   - Windows: Run `ipconfig` in Command Prompt, look for "IPv4 Address"
   - Mac/Linux: Run `ifconfig` or `ip addr show`
   - Example: `192.168.1.100`

2. **Update the .env file:**
   - Open `mobile/.env`
   - Replace `192.168.1.100` with your actual IP address
   - Example: `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.150:5000/api/v1`

3. **Make sure your backend server is running:**
   - Start the server: `npm start` (from the root directory)
   - Server should be accessible at `http://YOUR_IP:5000`

## Alternative Solutions

### Using ngrok (Recommended for testing)
1. Install ngrok: `npm install -g ngrok`
2. Run: `ngrok http 5000`
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. Update .env: `EXPO_PUBLIC_API_BASE_URL=https://abc123.ngrok.io/api/v1`

### For Production
Replace the URL with your deployed server:
```
EXPO_PUBLIC_API_BASE_URL=https://your-domain.com/api/v1
```

## Troubleshooting

- **App crashes on startup:** Check if the API URL is correct and server is running
- **Network errors:** Ensure your phone and computer are on the same WiFi network
- **Firewall issues:** Make sure port 5000 is not blocked by your firewall