const migration = {
  description: 'The first migration',
  async collections () {
    return ['todo']
  },
  async up (db, step) {
    await step(() => db.collection('todo').save({
      _key: '1',
      title: 'Buy milk',
      completed: false
    }))
  },
  async down (db, step) {
    await step(() => db.collection('todo').remove({
      _key: '1'
    }))
  }
}

export default migration
