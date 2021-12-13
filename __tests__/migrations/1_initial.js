const migration = {
  async collections () {
    return {
      read: [],
      write: ['todo'],
      exclusive: []
    }
  },
  async up (db, step) {
    await step(() => db.collection('todo').save({
      _id: '1',
      title: 'Buy milk',
      completed: false
    }))
  },
  async down (db, step) {
  }
}
module.exports = migration
