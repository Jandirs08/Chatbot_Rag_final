// Update username for a specific user document in chatbot_rag_db
// Usage: run inside MongoDB container with mongosh --file /tmp/update_username.js

const userId = ObjectId("690b9957ef7faee0b23981b5");
const dbName = "chatbot_rag_db";
const newUsername = "ggg";

const dbTarget = db.getSiblingDB(dbName);
const res = dbTarget.users.updateOne({ _id: userId }, { $set: { username: newUsername } });
printjson(res);
print(`Username updated to '${newUsername}' for _id=${userId}`);