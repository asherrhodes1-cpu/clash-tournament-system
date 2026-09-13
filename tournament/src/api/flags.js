import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

const FLAGS = 'flags';

export function subscribeToFlags(onChange) {
  return onSnapshot(collection(db, FLAGS), (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createFlag(flagData, createdBy) {
  await addDoc(collection(db, FLAGS), {
    ...flagData,
    createdBy,
    createdAt: new Date().toISOString(),
    status: 'open',
    priority: flagData.priority || 'normal',
    responses: [],
    resolvedAt: null,
    resolvedBy: null,
  });
}

export async function updateFlagStatus(flagId, status, resolvedByUsername, staffResponse = null) {
  const update = { status };
  if (status === 'resolved') {
    update.resolvedAt = new Date().toISOString();
    update.resolvedBy = resolvedByUsername;
  }
  if (staffResponse) {
    update.responses = arrayUnion({
      sender: resolvedByUsername,
      message: staffResponse,
      timestamp: new Date().toISOString(),
    });
  }
  await updateDoc(doc(db, FLAGS, flagId), update);
}

export async function addFlagResponse(flagId, message, sender) {
  await updateDoc(doc(db, FLAGS, flagId), {
    responses: arrayUnion({
      sender,
      message,
      timestamp: new Date().toISOString(),
    }),
  });
}
