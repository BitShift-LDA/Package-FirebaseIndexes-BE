const { FieldValue } = require('firebase-admin/firestore')

/**
 * Auxiliar function that gets first and last doc of target index
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {FirebaseFirestore.transaction} t Optional Firestore transaction instance, if not defined, then it will use a normal get
 * @returns {Object} {firstDoc, lastDoc} If both are null,
 * then no docs exist with this index name, if lastDoc is null,
 * then only one doc exists and firstDoc is also the lastDoc
 */
const aux_getFirstAndLastDoc = (indexCollectionRef, indexName, t) => {
  return new Promise(async(resolve, reject) => {
    // Get first doc
    const firstDocName = indexName+":0";
    const firstDocRef = indexCollectionRef.doc(firstDocName);
    let firstDoc;
    await (t ? t.get(firstDocRef) : firstDocRef.get()).then((doc) => {firstDoc = doc});

    if (!firstDoc.exists) {resolve({firstDoc: null, lastDoc: null}); return;}

    // Get last doc
    const lastDocName = firstDoc.data().latestDocName;

    if (lastDocName === firstDocName) {resolve({firstDoc, lastDoc: null}); return;}

    const lastDocRef = indexCollectionRef.doc(lastDocName);
    let lastDoc;
    await (t ? t.get(lastDocRef) : lastDocRef.get()).then((doc) => {lastDoc = doc});
    
    resolve({firstDoc, lastDoc});
  });
};

/**
 * Auxiliar function that gets the number of entries to add to each doc
 * @param {Document} firstDoc Object holding first doc data
 * @param {Document} lastDoc Object holding last doc data
 * @param {number} numOfEntries Number of entries to add
 * @param {number} maxEntriesPerDoc Maximum number of entries per doc
 * @returns {Object} Object with key = doc number and value = number of entries to add to that doc
 */
const aux_getDocNumEntriesToAddMap = (firstDoc, lastDoc, numOfEntries, maxEntriesPerDoc) => {
  const docNumEntriesToAddMap = {};
  let counter_entriesLeftToPlace = numOfEntries;

  let firstDocLength = firstDoc && firstDoc.data() && Object.keys(firstDoc.data()).length;
  let lastDocLength = lastDoc && lastDoc.data() && Object.keys(lastDoc.data()).length;

  if (firstDoc && firstDoc.data() && firstDoc.data().latestDocName) {firstDocLength--;} // Remove latestDocName from length
  
  const latestDocNumber = firstDoc && firstDoc.data() && firstDoc.data().latestDocName && firstDoc.data().latestDocName.split(":")[1];

  // Note: firstDoc (or doc 0) has maxEntries = maxEntriesPerDoc-1, instead of maxEntriesPerDoc like other docs
  // because the first doc also has the latestDocName property
  if (firstDoc === null) { // No docs exist yet
    // Calculate for first doc first
    if (numOfEntries <= maxEntriesPerDoc-1) { // All entries fit in first doc
      docNumEntriesToAddMap[0] = numOfEntries;
      counter_entriesLeftToPlace -= numOfEntries; // = 0
    } else { // Fill first doc and then calculate for other docs
      docNumEntriesToAddMap[0] = maxEntriesPerDoc-1;
      counter_entriesLeftToPlace -= maxEntriesPerDoc-1; // = numOfEntries-(maxEntriesPerDoc-1)
      let counterCurrentDoc = 1;
      while (counter_entriesLeftToPlace > 0) {
        if (counter_entriesLeftToPlace <= maxEntriesPerDoc) {
          docNumEntriesToAddMap[counterCurrentDoc] = counter_entriesLeftToPlace;
          counter_entriesLeftToPlace -= counter_entriesLeftToPlace; // = 0
        } else {
          docNumEntriesToAddMap[counterCurrentDoc] = maxEntriesPerDoc;
          counter_entriesLeftToPlace -= maxEntriesPerDoc; // = counter_entriesLeftToPlace-maxEntriesPerDoc
        }
        counterCurrentDoc++;
      }
    }
  } else if (lastDoc === null) { // In this case we will add entries to doc 0 in case it isn't already full
    // Calculate for first doc first
    if (firstDocLength < maxEntriesPerDoc-1) { // First doc still not full
      if (numOfEntries <= maxEntriesPerDoc-1-firstDocLength) { // All entries fit in first doc
        docNumEntriesToAddMap[0] = numOfEntries;
        counter_entriesLeftToPlace -= numOfEntries; // = 0
      } else { // Fill first doc and then calculate for other docs
        docNumEntriesToAddMap[0] = maxEntriesPerDoc-1-firstDocLength;
        counter_entriesLeftToPlace -= maxEntriesPerDoc-1-firstDocLength; // = numOfEntries-(maxEntriesPerDoc-1-firstDocLength)
        let counterCurrentDoc = 1;
        while (counter_entriesLeftToPlace > 0) {
          if (counter_entriesLeftToPlace <= maxEntriesPerDoc) {
            docNumEntriesToAddMap[counterCurrentDoc] = counter_entriesLeftToPlace;
            counter_entriesLeftToPlace -= counter_entriesLeftToPlace; // = 0
          } else {
            docNumEntriesToAddMap[counterCurrentDoc] = maxEntriesPerDoc;
            counter_entriesLeftToPlace -= maxEntriesPerDoc; // = counter_entriesLeftToPlace-maxEntriesPerDoc
          }
          counterCurrentDoc++;
        }
      }
    } else { // First doc already full
      let counterCurrentDoc = 1;
      while (counter_entriesLeftToPlace > 0) {
        if (counter_entriesLeftToPlace <= maxEntriesPerDoc) {
          docNumEntriesToAddMap[counterCurrentDoc] = counter_entriesLeftToPlace;
          counter_entriesLeftToPlace -= counter_entriesLeftToPlace; // = 0
        } else {
          docNumEntriesToAddMap[counterCurrentDoc] = maxEntriesPerDoc;
          counter_entriesLeftToPlace -= maxEntriesPerDoc; // = counter_entriesLeftToPlace-maxEntriesPerDoc
        }
        counterCurrentDoc++;
      }
    }
  } else { // In this case we will only add entries to lastDoc if it isn't already full and above
    // Calculate for last doc first
    if (lastDocLength < maxEntriesPerDoc) { // Last doc still not full
      if (numOfEntries <= maxEntriesPerDoc-lastDocLength) { // All entries fit in last doc
        docNumEntriesToAddMap[latestDocNumber] = numOfEntries;
        counter_entriesLeftToPlace -= numOfEntries; // = 0
      } else { // Fill last doc and then calculate for other docs
        docNumEntriesToAddMap[latestDocNumber] = maxEntriesPerDoc-lastDocLength;
        counter_entriesLeftToPlace -= maxEntriesPerDoc-lastDocLength; // = numOfEntries-(maxEntriesPerDoc-lastDocLength)
        let counterCurrentDoc = parseInt(latestDocNumber)+1;
        while (counter_entriesLeftToPlace > 0) {
          if (counter_entriesLeftToPlace <= maxEntriesPerDoc) {
            docNumEntriesToAddMap[counterCurrentDoc] = counter_entriesLeftToPlace;
            counter_entriesLeftToPlace -= counter_entriesLeftToPlace; // = 0
          } else {
            docNumEntriesToAddMap[counterCurrentDoc] = maxEntriesPerDoc;
            counter_entriesLeftToPlace -= maxEntriesPerDoc; // = counter_entriesLeftToPlace-maxEntriesPerDoc
          }
          counterCurrentDoc++;
        }
      }
    } else { // Last doc already full
      let counterCurrentDoc = parseInt(latestDocNumber)+1;
      while (counter_entriesLeftToPlace > 0) {
        if (counter_entriesLeftToPlace <= maxEntriesPerDoc) {
          docNumEntriesToAddMap[counterCurrentDoc] = counter_entriesLeftToPlace;
          counter_entriesLeftToPlace -= counter_entriesLeftToPlace; // = 0
        } else {
          docNumEntriesToAddMap[counterCurrentDoc] = maxEntriesPerDoc;
          counter_entriesLeftToPlace -= maxEntriesPerDoc; // = counter_entriesLeftToPlace-maxEntriesPerDoc
        }
        counterCurrentDoc++;
      }
    }
  }

  return docNumEntriesToAddMap;
};

/**
 * Adds given entries to given index
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {Object} entries Entries object to add to merge with docs
 * @param {number} maxEntriesPerDoc Maximum number of entries per doc
 * @param {FirebaseFirestore.batch} writeBatch Firestore batch instance
 * @returns {Promise} Promise that resolves when entries are added to batch
 */
const indexAddEntries = (indexCollectionRef, indexName, entries, maxEntriesPerDoc, writeBatch) => {
  return new Promise(async(resolve, reject) => {
    // Entries to add to index
    const entryKeys = Object.keys(entries);
    const numOfEntries = entryKeys.length;

    if (numOfEntries < 1) {resolve(); return;} // No entries to add
    if (numOfEntries > 499) {reject("Max entries is 499."); return;} // 500 is max entries per batch and we might need 1 extra for latestDocName

    // Get first and last doc
    const {firstDoc, lastDoc} = await aux_getFirstAndLastDoc(indexCollectionRef, indexName);

    // Get docNumEntriesToAddMap
    const docNumEntriesToAddMap = aux_getDocNumEntriesToAddMap(firstDoc, lastDoc, numOfEntries, maxEntriesPerDoc);

    const isLatestDocNameUpdated = false;

    // Add entries to docs
    const docIndexKeys = Object.keys(docNumEntriesToAddMap);
    for (let i = 0; i < docIndexKeys.length; i++) {
      const key = docIndexKeys[i];
      const targetDocName = indexName+":"+key;
      const targetDocRef = indexCollectionRef.doc(targetDocName);
      const numEntriesToAdd = docNumEntriesToAddMap[key];

      // Build targetDocEntries
      const targetDocEntriesKeys = entryKeys.splice(0, numEntriesToAdd);
      const targetDocEntries = {};
      for (let j = 0; j < targetDocEntriesKeys.length; j++) {
        const key = targetDocEntriesKeys[j];
        targetDocEntries[key] = entries[key];
      }

      if (!isLatestDocNameUpdated && key === 0) { // If latestDocName not updated and we are adding to doc 0
        targetDocEntries.latestDocName = indexName+":"+(docIndexKeys[docIndexKeys.length-1]);
        isLatestDocNameUpdated = true;
      }

      // Add entries to doc
      writeBatch.set(targetDocRef, targetDocEntries, {merge: true});      
    }

    // Update lastestDocName if not updated already
    if (!isLatestDocNameUpdated) {
      const firstDocName = indexName+":0";
      const latestDocName = indexName+":"+(docIndexKeys[docIndexKeys.length-1]);
      writeBatch.set(indexCollectionRef.doc(firstDocName), {"latestDocName": latestDocName}, {merge: true});
    }

    resolve();
  });
};

/**
 * Returns the index entry for given entryKey and the doc name of the doc that contains the entry
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @returns {Object} {indexDocName, entry} If entry is not found, then indexDocName and entry are null
 */
const indexFindEntry = async(indexCollectionRef, indexName, entryKey) => {
  return new Promise(async(resolve, reject) => {
    const firstDocName = indexName+":0";
    const firstDoc = await indexCollectionRef.doc(firstDocName).get();
    if (!firstDoc.exists || !firstDoc.data() || !firstDoc.data().latestDocName) {resolve({indexDocName: null, entry: null}); return;} // No docs in index

    const firstDocData = firstDoc.data();

    // Check if entry is in firstDoc
    if (firstDocData[entryKey]) {
      resolve({indexDocName: firstDocName, entry: firstDocData[entryKey]});
      return;
    }

    const latestDocName = firstDocData.latestDocName;
    const latestDocIndex = parseInt(latestDocName.split(":")[1]);

    if (!latestDocIndex || latestDocIndex < 1) {resolve({indexDocName: null, entry: null}); return;} // Entry doesn't exist

    // Check all the other docs
    let currentDoc = 1;
    let indexDocName = null;
    let entry = null;

    while (currentDoc <= latestDocIndex && entry === null && indexDocName === null) {
      const docName = indexName+":"+currentDoc;
      const doc = await indexCollectionRef.doc(docName).get();
      if (doc.exists && doc.data() && doc.data()[entryKey]) {
        indexDocName = docName;
        entry = doc.data()[entryKey];
      }
      currentDoc++;
    }

    resolve({indexDocName: indexDocName, entry: entry});
  });
};

/**
 * Deletes given entry from given index
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {FirebaseFirestore.batch} writeBatch Firestore batch instance
 * @returns {Promise<boolean>} Promise that resolves with a boolean indicating whether the delete was successfully added to batch
 */
const indexFindAndDeleteEntry = async(indexCollectionRef, indexName, entryKey, writeBatch) => {
  let willDelete = false;
  return new Promise(async(resolve, reject) => {
    const {indexDocName, entry} = await indexFindEntry(indexCollectionRef, indexName, entryKey);
    if (indexDocName && entry) {
      willDelete = true;
      writeBatch.update(indexCollectionRef.doc(indexDocName), {[entryKey]: FieldValue.delete()});
    }
    resolve(willDelete);
  });
};

/**
 * Finds and sets given entry to new `entryValue` value. If no entry is found, then adds it if `maxEntriesPerDoc` is defined
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.batch} writeBatch Firestore batch instance
 * @param {number} [maxEntriesPerDoc] Maximum number of entries per doc
 * @returns {Promise} Promise that resolves when update is added to batch
 */
const indexFindAndSetEntry = async(indexCollectionRef, indexName, entryKey, entryValue, writeBatch, maxEntriesPerDoc) => {
  return new Promise(async(resolve, reject) => {
    const {indexDocName, entry} = await indexFindEntry(indexCollectionRef, indexName, entryKey);
    if (indexDocName && entry) { // Entry found, lets set it
      writeBatch.update(indexCollectionRef.doc(indexDocName), {[entryKey]: entryValue});
    } else if (maxEntriesPerDoc) { // Entry not found, lets add it if maxEntriesPerDoc is defined
      await indexAddEntries(indexCollectionRef, indexName, {[entryKey]: entryValue}, maxEntriesPerDoc, writeBatch);
    }
    resolve();
  });
};

/**
 * Finds and merges given entry's value with new `entryValue` value. If no entry is found, then adds it if `maxEntriesPerDoc` is defined
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.batch} writeBatch Firestore batch instance
 * @param {number} [maxEntriesPerDoc] Maximum number of entries per doc
 * @returns {Promise} Promise that resolves when update is added to batch
 */
const indexFindAndUpdateEntry = async(indexCollectionRef, indexName, entryKey, entryValue, writeBatch, maxEntriesPerDoc) => {
  return new Promise(async(resolve, reject) => {
    const {indexDocName, entry} = await indexFindEntry(indexCollectionRef, indexName, entryKey);
    if (indexDocName && entry) { // Entry found, lets update it
      writeBatch.update(indexCollectionRef.doc(indexDocName), {[entryKey]: {...entry, ...entryValue}});
    } else if (maxEntriesPerDoc) { // Entry not found, lets add it if maxEntriesPerDoc is defined
      await indexAddEntries(indexCollectionRef, indexName, {[entryKey]: entryValue}, maxEntriesPerDoc, writeBatch);
    }
    resolve();
  });
};

/**
 * Updates entryValue with entryKey in indexDocName
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexDocName Doc name where entry is located
 * @param {string} entryKey Key of the entry to update
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.batch} writeBatch Firestore batch instance
 */
const indexSetEntry = (indexCollectionRef, indexDocName, entryKey, entryValue, writeBatch) => {
  writeBatch.update(indexCollectionRef.doc(indexDocName), {[entryKey]: entryValue}, {merge: true});
}

/**
 * Returns all docs data of given indexName in an array
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @returns {Array} Array of docs data, each index in array = doc number
 */
const indexGetAllIndexDocs = (indexCollectionRef, indexDocName) => {
  return new Promise(async(resolve, reject) => {  
    const docs = [];
    const docsPromises = [];

    await indexCollectionRef.doc(indexDocName+":0").get().then(async(baseIndexDoc) => {
      if (!baseIndexDoc.exists) {resolve(docs); return;} // No docs in index
      const baseDocData = baseIndexDoc.data();
      if (!baseDocData || !baseDocData.latestDocName) {resolve(docs); return;} // No docs in index

      docs[0] = baseDocData;

      const latestDocName = baseDocData.latestDocName;

      // If more than 1 doc
      if (latestDocName !== indexDocName+":0") {
        const latestDocNameSplit = latestDocName.split(":");
        const latestDocNumber = parseInt(latestDocNameSplit[1]);

        for (let i = latestDocNumber; i > 0; i--) {
          const getDoc = indexCollectionRef.doc(indexDocName+":"+i).get().then((indexDoc) => {
            const docData = indexDoc.data();
            docs[i] = docData;
          });
          docsPromises.push(getDoc);
        }
      }  
    });

    await Promise.all(docsPromises);

    resolve(docs);
  });
};

/**
 * Adds given entries to given index
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {Object} entries Entries object to add to merge with docs
 * @param {number} maxEntriesPerDoc Maximum number of entries per doc
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @returns {Promise} Promise that resolves when entries are added to batch
 */
const indexAddEntriesInTransaction = (indexCollectionRef, indexName, entries, maxEntriesPerDoc, t) => {
  return new Promise(async(resolve, reject) => {
    // Entries to add to index
    const entryKeys = Object.keys(entries);
    const numOfEntries = entryKeys.length;

    if (numOfEntries < 1) {resolve(); return;} // No entries to add
    if (numOfEntries > 499) {reject("Max entries is 499."); return;} // 500 is max entries per batch and we might need 1 extra for latestDocName

    // Get first and last doc
    const {firstDoc, lastDoc} = await aux_getFirstAndLastDoc(indexCollectionRef, indexName, t);

    // Get docNumEntriesToAddMap
    const docNumEntriesToAddMap = aux_getDocNumEntriesToAddMap(firstDoc, lastDoc, numOfEntries, maxEntriesPerDoc);

    const isLatestDocNameUpdated = false;

    // Add entries to docs
    const docIndexKeys = Object.keys(docNumEntriesToAddMap);
    for (let i = 0; i < docIndexKeys.length; i++) {
      const key = docIndexKeys[i];
      const targetDocName = indexName+":"+key;
      const targetDocRef = indexCollectionRef.doc(targetDocName);
      const numEntriesToAdd = docNumEntriesToAddMap[key];

      // Build targetDocEntries
      const targetDocEntriesKeys = entryKeys.splice(0, numEntriesToAdd);
      const targetDocEntries = {};
      for (let j = 0; j < targetDocEntriesKeys.length; j++) {
        const key = targetDocEntriesKeys[j];
        targetDocEntries[key] = entries[key];
      }

      if (!isLatestDocNameUpdated && key === 0) { // If latestDocName not updated and we are adding to doc 0
        targetDocEntries.latestDocName = indexName+":"+(docIndexKeys[docIndexKeys.length-1]);
        isLatestDocNameUpdated = true;
      }

      t.set(targetDocRef, targetDocEntries, {merge: true});  
    }

    // Update lastestDocName if not updated already
    if (!isLatestDocNameUpdated) {
      const firstDocName = indexName+":0";
      const latestDocName = indexName+":"+(docIndexKeys[docIndexKeys.length-1]);
      const firstDocRef = indexCollectionRef.doc(firstDocName);
      t.set(firstDocRef, {"latestDocName": latestDocName}, {merge: true});
    }

    resolve();
  });
};

/**
 * Returns the index entry for given entryKey and the doc name of the doc that contains the entry
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @returns {Promise} Promise that resolves with an object {indexDocName, entry} If entry is not found, then indexDocName and entry are null
 */
const indexFindEntryInTransaction = async(indexCollectionRef, indexName, entryKey, t) => {
  return new Promise(async(resolve, reject) => {
    const firstDocName = indexName+":0";
    const firstDoc = await t.get(indexCollectionRef.doc(firstDocName));
    if (!firstDoc.exists || !firstDoc.data() || !firstDoc.data().latestDocName) {resolve({indexDocName: null, entry: null}); return;} // No docs in index

    const firstDocData = firstDoc.data();

    // Check if entry is in firstDoc
    if (firstDocData[entryKey]) {
      resolve({indexDocName: firstDocName, entry: firstDocData[entryKey]});
      return;
    }

    const latestDocName = firstDocData.latestDocName;
    const latestDocIndex = parseInt(latestDocName.split(":")[1]);

    if (!latestDocIndex || latestDocIndex < 1) {resolve({indexDocName: null, entry: null}); return;} // Entry doesn't exist

    // Check all the other docs
    let currentDoc = 1;
    let indexDocName = null;
    let entry = null;

    while (currentDoc <= latestDocIndex && entry === null && indexDocName === null) {
      const docName = indexName+":"+currentDoc;
      const doc = await t.get(indexCollectionRef.doc(docName));
      if (doc.exists && doc.data() && doc.data()[entryKey]) {
        indexDocName = docName;
        entry = doc.data()[entryKey];
      }
      currentDoc++;
    }

    resolve({indexDocName: indexDocName, entry: entry});
  });
};

/**
 * Finds and deletes given entry from given index in a transaction
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @returns {Promise<boolean>} Promise that resolves with a boolean indicating whether the delete was successfully added to transaction
 */
const indexFindAndDeleteEntryInTransaction = async(indexCollectionRef, indexName, entryKey, t) => {
  let willDelete = false;
  return new Promise(async(resolve, reject) => {
    const {indexDocName, entry} = await indexFindEntryInTransaction(indexCollectionRef, indexName, entryKey, t);
    if (indexDocName && entry) {
      willDelete = true;
      t.update(indexCollectionRef.doc(indexDocName), {[entryKey]: FieldValue.delete()});
    }
    resolve(willDelete);
  });
};

/**
 * Finds and sets given entry to new `entryValue` value in a transaction. If no entry is found, then adds it if `maxEntriesPerDoc` is defined
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @param {number} [maxEntriesPerDoc] Maximum number of entries per doc
 * @returns {Promise} Promise that resolves when update is added to transaction
 */
const indexFindAndSetEntryInTransaction = async (indexCollectionRef, indexName, entryKey, entryValue, t, maxEntriesPerDoc) => {
  const {indexDocName, entry} = await indexFindEntryInTransaction(indexCollectionRef, indexName, entryKey, t);
  if (indexDocName && entry) { // Entry found, lets set it
    t.update(indexCollectionRef.doc(indexDocName), {[entryKey]: entryValue});
  } else if (maxEntriesPerDoc) { // Entry not found, lets add it if maxEntriesPerDoc is defined
    await indexAddEntriesInTransaction(indexCollectionRef, indexName, {[entryKey]: entryValue}, maxEntriesPerDoc, t);
  }
};

/**
 * Finds and merges given entry's value with new `entryValue` value in a transaction. If no entry is found, then adds it if `maxEntriesPerDoc` is defined
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {string} entryKey Key of the entry to search for in the index docs
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @param {number} [maxEntriesPerDoc] Maximum number of entries per doc
 * @returns {Promise} Promise that resolves when update is added to transaction
 */
const indexFindAndUpdateEntryInTransaction = async (indexCollectionRef, indexName, entryKey, entryValue, t, maxEntriesPerDoc) => {
  const {indexDocName, entry} = await indexFindEntryInTransaction(indexCollectionRef, indexName, entryKey, t);
  if (indexDocName && entry) { // Entry found, lets update it
    t.update(indexCollectionRef.doc(indexDocName), {[entryKey]: {...entry, ...entryValue}});
  } else if (maxEntriesPerDoc) { // Entry not found, lets add it if maxEntriesPerDoc is defined
    await indexAddEntriesInTransaction(indexCollectionRef, indexName, {[entryKey]: entryValue}, maxEntriesPerDoc, t);
  }
};

/**
 * Updates entryValue with entryKey in indexDocName
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexDocName Doc name where entry is located
 * @param {string} entryKey Key of the entry to update
 * @param {Object} entryValue Value of the entry to update
 * @param {FirebaseFirestore.transaction} t Optional Firestore transaction instance
 * @returns {Promise} Promise that resolves when update is ran
 */
const indexSetEntryInTransaction = (indexCollectionRef, indexDocName, entryKey, entryValue, t) => {
  return t.set(indexCollectionRef.doc(indexDocName), {[entryKey]: entryValue}, {merge: true});
}

/**
 * Returns all docs data of given indexName in an array
 * @param {CollectionReference} indexCollectionRef Firestore collection ref of target index
 * @param {string} indexName For example, if target index first doc is "!!!users:0" then indexName is "!!!users"
 * @param {FirebaseFirestore.transaction} t Firestore transaction instance
 * @returns {Array} Array of docs data, each index in array = doc number
 */
const indexGetAllIndexDocsInTransaction = (indexCollectionRef, indexDocName, t) => {
  return new Promise(async(resolve, reject) => {  
    const docs = [];
    const docsPromises = [];

    const firstDocRef = indexCollectionRef.doc(indexDocName+":0");

    await t.get(firstDocRef).then(async(baseIndexDoc) => {
      if (!baseIndexDoc.exists) {resolve(docs); return;} // No docs in index
      const baseDocData = baseIndexDoc.data();
      if (!baseDocData || !baseDocData.latestDocName) {resolve(docs); return;} // No docs in index

      docs[0] = baseDocData;

      const latestDocName = baseDocData.latestDocName;

      // If more than 1 doc
      if (latestDocName !== indexDocName+":0") {
        const latestDocNameSplit = latestDocName.split(":");
        const latestDocNumber = parseInt(latestDocNameSplit[1]);

        for (let i = latestDocNumber; i > 0; i--) {
          const nextDocRef = indexCollectionRef.doc(indexDocName+":"+i);
          const getDoc = t.get(nextDocRef).then((indexDoc) => {
            const docData = indexDoc.data();
            docs[i] = docData;
          });
          docsPromises.push(getDoc);
        }
      }  
    });

    await Promise.all(docsPromises);

    resolve(docs);
  });
};

/**
 * Merges docs data array into a single object
 * @param {Array} docs Array of docs data returned by indexGetAllIndexDocs
 * @returns {Object} Merged docs data
 */
const indexMergeDocsArray = (docs) => {
  const mergedDocs = {};
  docs.forEach((doc) => {
    Object.keys(doc).forEach((key) => {
      mergedDocs[key] = doc[key];
    });
  });
  return mergedDocs;
};

module.exports = {
  // With writeBatch
  indexAddEntries,
  indexFindEntry,
  indexFindAndDeleteEntry,
  indexFindAndSetEntry,
  indexFindAndUpdateEntry,
  indexSetEntry,
  indexGetAllIndexDocs,

  // With transaction
  indexAddEntriesInTransaction,
  indexFindEntryInTransaction,
  indexFindAndDeleteEntryInTransaction,
  indexFindAndSetEntryInTransaction,
  indexFindAndUpdateEntryInTransaction,
  indexSetEntryInTransaction,
  indexGetAllIndexDocsInTransaction,

  // Auxiliar
  indexMergeDocsArray,
}