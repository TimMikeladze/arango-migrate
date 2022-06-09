const migration = {
  async collections () {
    return []
  },
  async beforeUp (db) {
    await db.collection('todo').ensureIndex({
      name: 'index_todo_completed',
      type: 'persistent',
      fields: ['completed'],
      inBackground: false
    })
  },
  async afterDown (db) {
    await db.collection('todo').dropIndex('index_todo_completed')
  }
}
export default migration
