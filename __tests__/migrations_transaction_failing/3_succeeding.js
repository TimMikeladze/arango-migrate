const migration = {
  async collections () {
    return ['todo']
  },
  async up (db, step) {
    await step(() => db.collection('todo').save({
      _key: '2',
      title: 'Buy cheese',
      completed: false
    }))
  }
}
export default migration
