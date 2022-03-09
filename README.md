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
import { User } from "./data/entities";

async function main() {
  const context = createDataContext({
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
    // the following both settings depend on the underlying
    // data adapter
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

// depending on data adapter, it might be
// possible to do raw queries
const result: any = await context.query(
  "SELECT * FROM users WHERE id=$1 AND is_active=$2;",
  23979,
  true
);
console.log(result);

main().catch(console.error);
```

## Documentation

The API documentation can be found [here](https://egomobile.github.io/node-orm-pg/).
