# Change Log (@egomobile/orm-pg)

## 0.21.0

- add `chunkSize` to [IWithPostgresOptions interface](https://egomobile.github.io/node-orm-pg/interfaces/IWithPostgresOptions.html)

## 0.20.0

- update to version `^0.14.0` of [node-orm](https://github.com/egomobile/node-orm)
- add cursor support, using [pg-cursor](https://www.npmjs.com/package/pg-cursor) by default
- `npm update`(s)

## 0.19.0

- `npm update`(s)
- (bug-)fixes

## 0.18.1

- add `noTransactions` flag for `PostgreSQLMigrationContext` based types
- library requires at least [Node 18](https://nodejs.org/en/blog/release/v18.0.0/) now
- `npm update`s

## 0.17.0

- add `noDbNull` setting to [IWithPostgresConnection interface](https://egomobile.github.io/node-orm-pg/interfaces/IWithPostgresConnection.html)

## 0.16.0

- implement `createWithPostgres()` function, which creates a function, that opens known PostgreSQL connection and invoke an action for them

## 0.15.2

- update to version `^0.11.0` of [node-orm](https://github.com/egomobile/node-orm)
- `npm update`s
- (bug-)fixes
- code cleanups and improvements

## 0.14.0

- improve [count() method](https://egomobile.github.io/node-orm-pg/classes/PostgreSQLDataAdapter.html#count)

## 0.13.0

- update to version `^0.10.0` of [node-orm](https://github.com/egomobile/node-orm)
- code cleanups and improvements

## 0.12.1

- **BREAKING CHANGE**: update to version `^0.9.0` of [node-orm](https://github.com/egomobile/node-orm)
- library requires at least [Node 16](https://nodejs.org/en/blog/release/v16.0.0/) now
- add `registerBigIntAsNumber()` function, which can help to fix issue, that `bigint` is returned as `string` instead of `number`
- `npm update`s
- add missing documentation
- code cleanups

## 0.11.0

- **BREAKING CHANGE**: (module property of IPostgreSQLMigration interface)[https://egomobile.github.io/node-orm-pg/interfaces/IPostgreSQLMigration.html#module] is now lazy loaded and read-only

## 0.10.0

- update to `@egomobile/orm^0.8.0`
- apply new [linter config](https://github.com/egomobile/eslint-config-ego)
- library requires at least [Node 14](https://nodejs.org/en/blog/release/v14.0.0/) now
- `npm update`s

## 0.8.1

- add [queryAndMap()](https://egomobile.github.io/node-orm-pg/classes/PostgreSQLDataAdapter.html#queryAndMap)
- (bug-)fixes

## 0.7.0

- implement data transformation support for fields of PostgreSQL entities
- improve and fix debug messages in [PostgreSQLMigrationContext](https://egomobile.github.io/node-orm-pg/classes/PostgreSQLMigrationContext.html)

## 0.6.0

- add debugging

## 0.5.1

- update to `@egomobile/orm^0.5.0`
- (bug-)fixes

## 0.4.6

- implement migration classes and helpers
- (bug-)fixes

## 0.3.2

- improve [update() method](https://egomobile.github.io/node-orm-pg/classes/PostgreSQLDataAdapter.html#update)
- (bug-)fixes

## 0.2.1

- **BREAKING CHANGE**: update to `@egomobile/orm^0.4.0`

## 0.1.0

- initial release
