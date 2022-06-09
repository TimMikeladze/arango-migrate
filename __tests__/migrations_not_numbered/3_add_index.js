const migration = {
  async collections () {
    return []
  },
  async beforeUp (db) {
    await db.collection('todo').ensureIndex({
      type: 'persistent',
      fields: ['completed'],
      inBackground: false
    })
  },
  async up (db, step, data) {
  },
  async beforeDown (db) {
  },
  async down (db, step, data) {
  }
}
export default migration
