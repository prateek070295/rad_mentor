// scripts/migrateTopics.js

// CHANGED: Switched from 'import' to the more compatible 'require' syntax
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// CHANGED: This is the standard way to import a JSON file in a Node.js script
const serviceAccount = require('../functions/serviceAccountKey.json');

// --- The rest of the script is exactly the same ---

// Initialize the Firebase Admin SDK
initializeApp({
  credential: cert(serviceAccount)
});

// Get a reference to the Firestore database
const db = getFirestore();

// A helper function to format the topic name nicely (e.g., "head_neck" -> "Head Neck")
function formatTopicName(topicKey) {
  return topicKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize first letter of each word
}

// The main migration function
async function migrateTopics() {
  console.log('Starting migration...');

  // 1. Get all documents from the 'questions' collection
  const questionsSnapshot = await db.collection('questions').get();
  
  if (questionsSnapshot.empty) {
    console.log('No questions found to migrate. Exiting.');
    return;
  }

  console.log(`Found ${questionsSnapshot.size} questions to process.`);

  // 2. Count the occurrences of each unique topic
  const topicCounts = new Map();
  questionsSnapshot.forEach(doc => {
    const data = doc.data();
    const topicKey = data.topic; // e.g., "neuroradiology"

    if (topicKey && typeof topicKey === 'string') {
      const currentCount = topicCounts.get(topicKey) || 0;
      topicCounts.set(topicKey, currentCount + 1);
    }
  });

  console.log(`Found ${topicCounts.size} unique topics.`);

  // 3. Start a batch write to create the new 'questionTopics' collection
  const batch = db.batch();
  const questionTopicsRef = db.collection('questionTopics');

  topicCounts.forEach((count, topicKey) => {
    const docRef = questionTopicsRef.doc(topicKey);
    const data = {
      name: formatTopicName(topicKey),
      questionCount: count
    };
    
    console.log(`Preparing to write: ID=${topicKey}, Data=${JSON.stringify(data)}`);
    batch.set(docRef, data);
  });
  
  // 4. Commit the batch to the database
  await batch.commit();

  console.log('---------------------------------');
  console.log('✅ Migration complete! The "questionTopics" collection has been created.');
  console.log('---------------------------------');
}

// Run the migration
migrateTopics().catch(console.error);