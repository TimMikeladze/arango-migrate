import { CollectionType } from 'arangojs/collection'

const migration = {
  async collections () {
    return [
      'user',
      {
        collectionName: 'user_todo_edge',
        options: {
          type: CollectionType.EDGE_COLLECTION
        }
      }
    ]
  },
  async up (db, step) {
    await step(() => db.collection('user').save({
      _key: '1',
      name: 'John Doe'
    }))

    await step(() => db.collection('user_todo_edge').save({
      _key: '1',
      _from: 'user/1',
      _to: 'todo/1'
    }))
  },
  async afterDown (db, step, data) {
    await db.collection('user_todo_edge').drop()
    await db.collection('user').drop()
  }
}
export default migration
