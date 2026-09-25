// Bundled by global-setup.ts the same way the workers are, and served as a plain page script (not a worker): exposes
// the real `deleteExpirationRecords` so expiration-records.spec.ts exercises the actual bundled production code
// against a real IndexedDB, instead of reimplementing its schema assumptions in the test.
import { deleteExpirationRecords } from "../src/shared/expiration-records.js";

Object.assign(window, { __pwaDeleteExpirationRecords: deleteExpirationRecords });
