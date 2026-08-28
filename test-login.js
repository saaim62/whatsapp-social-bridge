const axios = require('axios');
axios.post('http://localhost:3000/api/auth/callback/credentials', {
  email: 'wrong@email.com',
  password: 'wrongpassword'
}).catch(e => console.log('Error:', e.response?.data || e.message));
