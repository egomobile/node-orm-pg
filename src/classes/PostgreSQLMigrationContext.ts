/* eslint-disable unicorn/filename-case */

// This file is part of the @egomobile/orm-pg distribution.
// Copyright (c) Next.e.GO Mobile SE, Aachen, Germany (https://e-go-mobile.com/)
//
// @egomobile/orm-pg is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as
// published by the Free Software Foundation, version 3.
//
// @egomobile/orm-pg is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import fs from 'fs';
import path from 'path';
import MigrationsEntity, { Migrations } from './pocos/Migrations';
import type { Nilable } from '@egomobile/orm/lib/types/internal';
import type { PostgreSQLDataAdapter, PostgreSQLDataAdapterOptionsValue } from './PostgreSQLDataAdapter';
import { createDataContext, EntityConfigurations, IDataAdapter, IDataContext } from '@egomobile/orm';
import type { DebugActionWithoutSource, Getter } from '../types/internal';
import { DebugAction, IPostgreSQLMigration } from '../types';
import { isNil, toDebugActionSafe } from '../utils/internal';
import { isPostgreSQLClientLike } from '../utils';

/**
 * Options for 'down()' method of a 'PostgreSQLMigrationContext' instance.
 */
export interface IDownOptions {
    /**
     * The optional timestamp to downgrade to.
     */
    timestamp?: Nilable<number>;
}

/**
 * Options for 'PostgreSQLMigrationContext' class.
 */
export interface IPostgreSQLMigrationContextOptions {
    /**
     * Custom options for the adapter.
     */
    adapter?: Nilable<PostgreSQLDataAdapterOptionsValue>;
    /**
     * The optional debug action / handler.
     */
    debug?: Nilable<DebugAction>;
    /**
     * Migrations to use.
     *
     * If string: The path to the migration files. Relative paths will be mapped to current working directory.
     * If array: The list of migrations.
     * If function: The function, which returns the list of migrations.
     *
     * Default: Subdirectory 'migration' inside current working directory.
     */
    migrations?: Nilable<string | IPostgreSQLMigration[] | Getter<IPostgreSQLMigration[]>>;
    /**
     * The name of the migration table. Default: 'migrations'
     */
    table?: Nilable<string>;
    /**
     * Include TypeScript (.ts) files instead of .js
     */
    typescript?: Nilable<boolean>;
}

interface IRunMigrationContext {
    adapter: PostgreSQLDataAdapter;
    context: IDataContext;
    existingMigration: Migrations | undefined;
    migration: IPostgreSQLMigration;
}

interface IRunMigrationsOptions {
    executeMigration: (context: IRunMigrationContext) => Promise<void>;
    migrations: IPostgreSQLMigration[];
    type: string;
}

/**
 * Options for 'up()' method of a 'PostgreSQLMigrationContext' instance.
 */
export interface IUpOptions {
    /**
     * The optional timestamp to upgrade to.
     */
    timestamp?: Nilable<number>;
}

/**
 * A PostgreSQL migration context.
 */
export class PostgreSQLMigrationContext {
    private readonly debug: DebugActionWithoutSource;

    /**
     * Initializes a new instance of that class.
     *
     * @param {IPostgreSQLMigrationContextOptions} options The options.
     */
    public constructor(public readonly options: IPostgreSQLMigrationContextOptions) {
        if (typeof options !== 'object') {
            throw new TypeError('options must be of type object');
        }

        this.debug = toDebugActionSafe('PostgreSQLMigrationContext', options.debug);
    }

    private async createContext() {
        const adapterOptions = this.options?.adapter;
        if (adapterOptions) {
            if (!isPostgreSQLClientLike(adapterOptions)) {
                adapterOptions.debug = adapterOptions.debug || this.debug;
            }
        }

        const adapter: IDataAdapter = new (require('./PostgreSQLDataAdapter').PostgreSQLDataAdapter)(adapterOptions);
        const entities: EntityConfigurations = {};

        let table = this.options.table;
        if (isNil(table)) {
            table = 'migrations';
        } else {
            if (typeof table !== 'string') {
                throw new TypeError('options.table must be of tpe string');
            }
        }

        entities[table] = MigrationsEntity;

        return {
            adapter: adapter as PostgreSQLDataAdapter,
            context: await createDataContext({
                adapter,
                entities
            })
        };
    }

    /**
     * Downgrades the database.
     *
     * @param {Nilable<IDownOptions>} [options] The custom options.
     */
    public async down(options?: Nilable<IDownOptions>) {
        if (!isNil(options?.timestamp)) {
            if (typeof options!.timestamp !== 'number') {
                throw new TypeError('options.timestamp must be of type number');
            }
        }

        const allMigrations = await this.getMigrations();
        // sort migrations DESC-ENDING by timestamp
        allMigrations.sort((x, y) => y.timestamp - x.timestamp);

        if (allMigrations.length) {
            this.debug(`Found ${allMigrations.length} down migration(s) found`, '🐞');
        } else {
            this.debug('No down migration(s) found', '⚠️');
        }

        let migrations: IPostgreSQLMigration[];
        if (typeof options?.timestamp === 'number') {
            this.debug(`Will downgrade to ${options.timestamp} ...`, '🐞');

            migrations = [];

            for (const m of allMigrations) {
                if (m.timestamp === options.timestamp) {
                    break;  // ... target reached
                }

                migrations.push(m);
                this.debug(`Will use downgrade script ${m.name} ...`, '🐞');
            }
        } else {
            this.debug('Will do complete downgrade ...', '🐞');

            migrations = allMigrations;
        }

        await this.runMigrations({
            migrations,
            executeMigration: async ({ adapter, context, existingMigration, migration }) => {
                if (existingMigration) {
                    await Promise.resolve(
                        migration.module.down(adapter, context, this.debug)
                    );

                    await context.remove(existingMigration);

                    this.debug(`Downgrade ${existingMigration.name} (${existingMigration.timestamp}) executed`, '✅');
                } else {
                    // already executed or not available
                    this.debug(`Skipping downgrade ${migration.name} (${migration.timestamp}) ...`, 'ℹ️');
                }
            },
            type: 'down'
        });
    }

    private async getMigrations(): Promise<IPostgreSQLMigration[]> {
        let { migrations } = this.options;
        if (isNil(migrations)) {
            migrations = path.join(process.cwd(), 'migration');
        }

        let loadedMigrations: IPostgreSQLMigration[];

        if (typeof migrations === 'string') {
            if (!path.isAbsolute(migrations)) {
                migrations = path.join(process.cwd(), migrations);
            }

            loadedMigrations = [];

            const filesAndFolders = await fs.promises.readdir(migrations);

            for (const item of filesAndFolders) {
                const rx = this.options.typescript ?
                    /^(\d+)(-)(.+)(\.ts)$/ : // (TIMESTAMP)-(NAME).ts
                    /^(\d+)(-)(.+)(\.js)$/; // (TIMESTAMP)-(NAME).js

                const match = rx.exec(item);
                if (!match) {
                    continue;
                }

                const fullPath = path.join(migrations, item);

                const stat = await fs.promises.stat(fullPath);
                if (stat.isFile()) {
                    loadedMigrations.push({
                        module: require(fullPath),
                        name: match[3],
                        timestamp: parseInt(match[1], 10)
                    });
                }
            }
        } else if (Array.isArray(migrations)) {
            loadedMigrations = migrations;
        } else if (typeof migrations === 'function') {
            loadedMigrations = await Promise.resolve(migrations());
        } else {
            throw new TypeError('options.migrations must be of type string, array or function');
        }

        if (!Array.isArray(loadedMigrations)) {
            throw new TypeError('migrations must be of type array');
        }
        if (loadedMigrations.some(m => typeof m !== 'object')) {
            throw new TypeError('All items of migrations must be of type object');
        }

        return loadedMigrations;
    }

    private async runMigrations({ executeMigration, migrations, type }: IRunMigrationsOptions) {
        const { adapter, context } = await this.createContext();

        this.debug(`Will execute migrations of type ${type} ...`, 'ℹ️');

        await context.query('START TRANSACTION;');
        try {
            const finishedMigrations = await context.find(Migrations);
            this.debug(`Found ${finishedMigrations.length} finished migrations in database`, '🐞');

            for (const m of migrations) {
                const existingMigration = finishedMigrations.find(
                    ({ name, timestamp }) =>
                        String(name) === String(m.name) &&
                        String(timestamp) === String(m.timestamp),
                );

                await executeMigration({
                    adapter,
                    context,
                    existingMigration,
                    migration: m
                });
            }

            await context.query('COMMIT;');
            this.debug(`All migrations of type ${type} executed`, '✅');
        } catch (ex) {
            await context.query('ROLLBACK;');
            this.debug(`Could not execute migrations of type ${type}: ${ex}`, '❌');

            throw ex;
        }
    }

    /**
     * Upgrades the database.
     *
     * @param {Nilable<IUpOptions>} [options] The custom options.
     */
    public async up(options?: Nilable<IUpOptions>) {
        if (!isNil(options?.timestamp)) {
            if (typeof options!.timestamp !== 'number') {
                throw new TypeError('options.timestamp must be of type number');
            }
        }

        const allMigrations = await this.getMigrations();
        // sort migrations ASC-ENDING by timestamp
        allMigrations.sort((x, y) => x.timestamp - y.timestamp);

        if (allMigrations.length) {
            this.debug(`Found ${allMigrations.length} up migration(s) found`, '🐞');
        } else {
            this.debug('No up migration(s) found', '⚠️');
        }

        let migrations: IPostgreSQLMigration[];
        if (typeof options?.timestamp === 'number') {
            this.debug(`Will upgrade to ${options.timestamp} ...`, '🐞');

            migrations = [];

            for (const m of allMigrations) {
                migrations.push(m);  // add ...
                this.debug(`Will use upgrade script ${m.name} ...`, '🐞');

                if (m.timestamp === options.timestamp) {
                    break;  // ... until timestamp has been found
                }
            }
        } else {
            this.debug('Will do complete upgrade ...', '🐞');

            migrations = allMigrations;
        }

        await this.runMigrations({
            migrations,
            executeMigration: async ({ adapter, context, existingMigration, migration }) => {
                if (existingMigration) {
                    // already executed
                    this.debug(`Skipping upgrade ${existingMigration.name} (${existingMigration.timestamp}) ...`, 'ℹ️');
                } else {
                    await Promise.resolve(
                        migration.module.up(adapter, context, this.debug)
                    );

                    const newMigration = new Migrations();
                    newMigration.name = migration.name;
                    newMigration.timestamp = migration.timestamp;

                    await context.insert(newMigration);
                    this.debug(`Upgrade ${migration.name} (${migration.timestamp}) executed`, '✅');
                }
            },
            type: 'up'
        });
    }
}
