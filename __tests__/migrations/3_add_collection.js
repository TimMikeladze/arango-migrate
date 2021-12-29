const migration = {
  async collections () {
    return ['user']
  },
  async afterDown (db, step, data) {
    await db.collection('user').drop()
  }
}
module.exports = migration
