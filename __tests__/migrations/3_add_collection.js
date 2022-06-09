const migration = {
  async collections () {
    return ['user']
  },
  async afterDown (db, step, data) {
    await db.collection('user').drop()
  }
}
export default migration
