import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ✅ **FIX**: Changed outdated 'assert' to the new 'with' syntax for importing JSON
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function findDuplicateQuestions() {
  console.log("Fetching all questions from the questionBank...");
  const snapshot = await db.collection('questionBank').get();
  
  if (snapshot.empty) {
    console.log("No questions found.");
    return;
  }

  // Group documents by questionText
  const questionsMap = new Map();
  snapshot.forEach(doc => {
    const data = doc.data();
    const questionText = data.questionText;
    if (!questionsMap.has(questionText)) {
      questionsMap.set(questionText, []);
    }
    questionsMap.get(questionText).push({ id: doc.id, ...data });
  });

  console.log(`\nFound ${questionsMap.size} unique question texts out of ${snapshot.size} total documents.`);
  console.log("--- Checking for Duplicates ---");

  let duplicateCount = 0;
  questionsMap.forEach((docs, text) => {
    if (docs.length > 1) {
      duplicateCount++;
      console.log(`\n[DUPLICATE FOUND] "${text}"`);
      console.log(`  This question appears ${docs.length} times in your database:`);
      docs.forEach(doc => {
        console.log(`  - ID: ${doc.id} | Paper: ${doc.exam} ${doc.year} ${doc.month} ${doc.paper}`);
      });
    }
  });

  if (duplicateCount === 0) {
    console.log("\nNo duplicates found. Your database is clean!");
  }
}

findDuplicateQuestions().catch(console.error);