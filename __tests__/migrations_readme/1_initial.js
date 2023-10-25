import { CollectionType } from 'arangojs/collection'

const migration = {
  description: 'Simple migration',
  async collections () {
    // All collections used in this migration must be defined here. A string or an options object can be used.
    return [
      'todo',
      'user',
      {
        collectionName: 'user_todo_edge',
        options: {
          type: CollectionType.EDGE_COLLECTION
        }
      }]
  },
  async up (db, step) {
    // Using the `step` function, add a new document to the collection as part of this migration's transaction.
    await step(async () => await db.collection('todo').save({
      _key: '1',
      name: 'Buy milk'
    }))

    await step(async () => await db.collection('user').save({
      _key: '1',
      name: 'John Doe'
    }))

    await step(async () => await db.collection('user_todo_edge').save({
      _from: 'user/1',
      _to: 'todo/1'
    }))
  }
}

export default migration
