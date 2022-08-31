const migration = {
  async collections () {
    return ['todo']
  },
  async up (db, step) {
    await step(() => db.collection('todo').save({
      title: Math.random().toString()
    }))
  }
}
export default migration
