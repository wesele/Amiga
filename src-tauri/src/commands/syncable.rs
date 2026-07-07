use crate::modules::database::DatabasePool;
use crate::modules::sync;

pub fn after_syncable_write(db: &DatabasePool) {
    sync::schedule_cloud_sync(db);
}
