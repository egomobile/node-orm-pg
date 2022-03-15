[![npm](https://img.shields.io/npm/v/@egomobile/orm-pg.svg)](https://www.npmjs.com/package/@egomobile/orm-pg)
[![last build](https://img.shields.io/github/workflow/status/egomobile/node-orm-pg/Publish)](https://github.com/egomobile/node-orm-pg/actions?query=workflow%3APublish)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/egomobile/node-orm-pg/pulls)

# @egomobile/orm-pg

> A PostgreSQL data adapter and other utilities for [@egomobile/orm](https://github.com/egomobile/node-orm) module.

## Install

Execute the following command from your project folder, where your `package.json` file is stored:

```bash
npm install --save @egomobile/orm-pg
```

The following modules are defined in [peerDependencies](https://nodejs.org/uk/blog/npm/peer-dependencies/) and have to be installed manually:

- [@egomobile/orm](https://github.com/egomobile/node-orm)
- [pg](https://github.com/brianc/node-postgres)

## Usage

```typescript
import { createDataContext } from "@egomobile/orm";
import { PostgreSQLDataAdapter } from "@egomobile/orm-pg";
import type { QueryResult } from "pg";
import { User } from "./data/entities";

async function main() {
  const context = await createDataContext({
    adapter: new PostgreSQLDataAdapter(),
    entities: {
      // name of the entity / table
      users: {
        ids: ["id"], // list of column(s) which represent the ID
        type: User, // the class / type to use to create objects from
      },
    },
  });

  const listOfUsers: User[] = await context.find(User, {
    // WHERE clause
    where: "is_active=$1 AND is_deleted=$2",
    params: [true, false], // $1, $2

    offset: 1, // skip the first
    limit: 100, // only return 100 rows
  });

  // return a user with ID 5979
  const specificUser: User | null = await context.findOne(User, {
    where: "id=$1",
    params: [5979], // $1
  });

  if (specificUser !== null) {
    // update with new data
    specificUser.last_name = "Doe";
    specificUser.first_name = "Jane";
    await context.update(specificUser);

    // remove from database
    await context.remove(specificUser);
  } else {
    console.log("User not found");
  }
}

// create new POCO
const newUser = new User();
newUser.first_name = "John";
newUser.last_name = "Doe";
// ... and add it to database
await context.insert(newUser);

// do raw queries
const result: QueryResult<any> = await context.query(
  "SELECT * FROM users WHERE id=$1 AND is_active=$2;",
  23979,
  true
);
console.log(result);

main().catch(console.error);
```

## Migrations

Before you can use migrations, first keep sure to have an existing `migrations` table in your database:

```sql
CREATE TABLE IF NOT EXISTS public.migrations
(
    "id" bigserial NOT NULL,
    "timestamp" bigint NOT NULL,
    "name" character varying NOT NULL,
    CONSTRAINT pk_migrations_id PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
);
```

A quick example how to use [PostgreSQLDataAdapter class](https://egomobile.github.io/node-orm-pg/classes/PostgreSQLDataAdapter.html):

```typescript
import { PostgreSQLDataAdapter } from "@egomobile/orm-pg";

async function main() {
  const context = new PostgreSQLMigrationContext({
    // a default adapter
    adapter: new PostgreSQLDataAdapter(),

    // scan for .js files
    // inside ./migration subfolder
    // with the following format:
    //
    // <UNIX-TIMESTAMP>-<NAME-OF-THE-MIGRATION>.js
    //
    // example: 1746942104690-CreateUserTable.js
    migrations: __dirname + "/migration",

    table: "migrations",
  });

  // UP-GRADE database
  await context.up();

  // DOWN-GRADE database
  await context.down();
}

main().catch(console.error);
```

A migration file looks like this:

```javascript
/**
 * Function to UP-GRADE the database.
 */
module.exports.up = async (context) => {
  // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

  await context.query(`
CREATE TABLE public.tdta_user
(
    "id" bigserial NOT NULL,
    "uuid" character(36) NOT NULL,
    "email" character varying NOT NULL,
    "created" timestamp with time zone NOT NULL,
    "updated" timestamp with time zone,

    CONSTRAINT "pk_tdta_user_id" PRIMARY KEY (id),
    CONSTRAINT "uq_tdta_user_uuid" UNIQUE (uuid),
    CONSTRAINT "uq_tdta_user_account_id" UNIQUE (account_id)
)
WITH (
    OIDS = FALSE
);
`);
};

/**
 * Function to DOWN-GRADE the database.
 */
module.exports.down = async (context) => {
  // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

  await context.query(`DROP TABLE public.tdta_user;`);
};
```

You are also able to create a migration file programmatically:

```typescript
import { createNewMigrationFile } from "@egomobile/orm-pg";

const newFilePath = await createNewMigrationFile("the name of the migration", {
  // create output file inside ./migrations sub folder
  dir: __dirname + "/migrations",

  // generate and add optional header and footer to the file
  header: ({ name, timestamp }) =>
    `// Hello, this is migration '${name}' created on ${timestamp}\n\n`,
  footer: "\n\n// Copyright (x) e.GO Mobile SE, Aachen, Germany\n\n",
});

console.log("Migration file has been created in", newFilePath);
```

## Documentation

The API documentation can be found [here](https://egomobile.github.io/node-orm-pg/).
