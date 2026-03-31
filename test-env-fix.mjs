import { getPineconeIndexName } from './lib/ragClient.mjs';
process.env.PINECONE_INDEX_NAME = 'test-index';
console.log('Detected index name:', getPineconeIndexName());
if (getPineconeIndexName() === 'test-index') {
  console.log('SUCCESS: Dynamic env loading works!');
} else {
  console.log('FAILURE: Dynamic env loading failed!');
}
