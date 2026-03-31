require('dotenv').config();
console.log('PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? 'Set (' + process.env.PINECONE_API_KEY.length + ' chars)' : 'Not set');
console.log('PINECONE_INDEX_NAME:', process.env.PINECONE_INDEX_NAME);
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'Set' : 'Not set');
