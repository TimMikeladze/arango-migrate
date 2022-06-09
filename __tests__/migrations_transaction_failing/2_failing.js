const migration = {
  async collections () {
    return ['todo']
  },
  async up (db, step) {
    await step(() => db.collection('todo').save({
      _key: '1',
      title: 'Buy milk',
      completed: false
    }))
  }
}
export default migration
