import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { getSystemDate } from './systemDate';

export async function logAuditEvent({
  module = 'System',
  actionType = 'ACTIVITY',
  description = '',
  desc = '',
  targetItem = 'N/A',
  target = '',
  details = {},
  performedBy = null
}) {
  try {
    let resolvedUser = performedBy;

    if (!resolvedUser) {
      const currentUser = auth?.currentUser;
      if (currentUser) {
        let userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Staff Member';
        let userRole = 'Staff';

        try {
          const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDocSnap.exists()) {
            const uData = userDocSnap.data();
            userName = uData.name || uData.fullName || userName;
            userRole = uData.role || (currentUser.email?.includes('admin') ? 'Admin' : 'Staff');
          } else {
            userRole = currentUser.email?.includes('admin') ? 'Admin' : 'Staff';
          }
        } catch {
          userRole = currentUser.email?.includes('admin') ? 'Admin' : 'Staff';
        }

        resolvedUser = {
          uid: currentUser.uid,
          name: userName,
          email: currentUser.email || '',
          role: userRole
        };
      } else {
        resolvedUser = {
          uid: 'SYSTEM',
          name: 'System User',
          email: '',
          role: 'Staff'
        };
      }
    }

    const finalDescription = description || desc || '';
    const finalTarget = (targetItem && targetItem !== 'N/A') ? targetItem : (target || targetItem || 'N/A');

    const logDoc = {
      module,
      actionType,
      description: finalDescription,
      targetItem: String(finalTarget || 'N/A'),
      target: String(finalTarget || 'N/A'),
      details: details || {},
      performedBy: {
        uid: resolvedUser.uid || 'N/A',
        name: resolvedUser.name || 'Staff User',
        email: resolvedUser.email || '',
        role: resolvedUser.role || 'Staff'
      },
      createdAt: serverTimestamp(),
      timestampISO: getSystemDate().toISOString()
    };

    await addDoc(collection(db, 'auditLogs'), logDoc);
  } catch (err) {
    console.warn('Audit log entry warning:', err);
  }
}

export default logAuditEvent;
