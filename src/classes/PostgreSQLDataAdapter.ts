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

import type PgCursor from "pg-cursor";
import { DataAdapterBase, IFindOneOptions, IFindOptions, NULL } from "@egomobile/orm";
import type { Constructor, List, Nilable } from "@egomobile/orm/lib/types/internal";
import { ClientConfig, Pool, PoolClient, PoolConfig, QueryResult } from "pg";
import { isExplicitNull } from "@egomobile/orm";
import type { DebugAction, PostgreSQLClientLike } from "../types";
import type { DebugActionWithoutSource, Getter } from "../types/internal";
import { asList, isIterable, isNil, toDebugActionSafe } from "../utils/internal";
import { isPostgreSQLClientLike } from "../utils";

interface IBuildFindQueryOptions extends IPostgreSQLFindOptions {
    shouldNotWrapFields?: boolean;
}

/**
 * Options for 'find()' method of a 'PostgreSQLDataAdapter' instance.
 */
export interface IPostgreSQLFindOptions extends IPostgreSQLFindOneOptions, IFindOptions {
    /**
     * @inheritdoc
     */
    fields?: Nilable<string[]>;
    /**
     * @inheritdoc
     */
    params?: Nilable<any[]>;
    /**
     * Sort settings.
     */
    sort?: Nilable<Record<string, "ASC" | "DESC">>;
    /**
     * @inheritdoc
     */
    where?: Nilable<string>;
}

/**
 * Options for 'findOne()' method of a 'PostgreSQLDataAdapter' instance.
 */
export interface IPostgreSQLFindOneOptions extends IFindOneOptions {
    /**
     * @inheritdoc
     */
    fields?: Nilable<string[]>;
    /**
     * @inheritdoc
     */
    params?: Nilable<any[]>;
    /**
     * Sort settings.
     */
    sort?: Nilable<Record<string, "ASC" | "DESC">>;
    /**
     * @inheritdoc
     */
    where?: Nilable<string>;
}

/**
 * Options for instance of 'PostgreSQLDataAdapter' class.
 */
export interface IPostgreSQLDataAdapterOptions {
    /**
     * Custom chunk size for cursor operations.
     *
     * @default `100`
     */
    chunkSize?: Nilable<number>;
    /**
     * The underlying client or a function, which returns it.
     */
    client?: Nilable<PostgreSQLClientLike | Getter<PostgreSQLClientLike> | PostgreSQLClientConfig>;
    /**
     * A custom class of a `pg-module` compatible class to do cursor operations.
     */
    cursorClass?: any;
    /**
     * The optional debug action / handler.
     */
    debug?: Nilable<DebugAction>;
}

interface IToClientGetterOptions {
    value: Nilable<PostgreSQLClientLike | Getter<PostgreSQLClientLike> | PostgreSQLClientConfig>;
}

interface ITransformValueOptions {
    direction: "from" | "to";
    field: string;
    type: Constructor<any>;
    value: any;
}


/**
 * A possible value for a pg client/pool configuration.
 */
export type PostgreSQLClientConfig = ClientConfig | PoolClient;

/**
 * A valid option value for 'PostgreSQLDataAdapter' class.
 */
export type PostgreSQLDataAdapterOptionsValue = IPostgreSQLDataAdapterOptions | PostgreSQLClientLike;

type SyncValueTransformer = (options: ITransformValueOptions) => any;

function transformValueUsingDbNull({ direction, value }: ITransformValueOptions): any {
    if (direction === "from") {
        return isNil(value) ? NULL : value;
    }
    else if (direction === "to") {
        return isExplicitNull(value) ? null : value;
    }
}

function transformValueUsingJSNull({ direction, value }: ITransformValueOptions): any {
    if (direction === "from") {
        return isNil(value) ? null : value;
    }
    else if (direction === "to") {
        return value === null || isExplicitNull(value) ? null : value;
    }
}

/**
 * A data adapter which is written for PostgreSQL databases.
 */
export class PostgreSQLDataAdapter extends DataAdapterBase {
    readonly #chunkSize: number;
    readonly #clientGetter: Getter<PostgreSQLClientLike>;
    readonly #cursorClass: any;
    readonly #debug: DebugActionWithoutSource;

    /**
     * Initializes a new instance of that class.
     *
     * @param {Nilable<PostgreSQLDataAdapterOptionsValue>} optionsOrClient The options or the client/pool.
     */
    public constructor(optionsOrClient?: Nilable<PostgreSQLDataAdapterOptionsValue>) {
        super();

        let options: Nilable<IPostgreSQLDataAdapterOptions>;
        if (isPostgreSQLClientLike(optionsOrClient)) {
            options = {
                "client": optionsOrClient
            };
        }
        else {
            options = optionsOrClient;
        }

        if (!isNil(options)) {
            if (typeof options !== "object") {
                throw new TypeError("optionsOrClient is invalid");
            }
        }

        if (!isNil(options?.chunkSize)) {
            if (typeof options?.chunkSize !== "number") {
                throw new TypeError("options.chunkSize must be of type number");
            }
        }

        this.#chunkSize = typeof options?.chunkSize === "number" ?
            options.chunkSize :
            100;
        this.#clientGetter = toClientGetter({
            "value": options?.client
        });
        this.#cursorClass = options?.cursorClass;
        this.#debug = toDebugActionSafe("PostgreSQLDataAdapter", options?.debug);
    }

    private buildFindQuery<T extends any = any>(
        type: Constructor<T>,
        findOptions: IBuildFindQueryOptions | null | undefined
    ) {
        const table = this.getEntityNameByTypeOrThrow(type);

        const shouldNotWrapFields = !!findOptions?.shouldNotWrapFields;

        const fields = findOptions?.fields;
        if (!isNil(fields)) {
            if (!Array.isArray(fields)) {
                throw new TypeError("findOptions.fields must be an array");
            }
        }

        const params = findOptions?.params;
        if (!isNil(params)) {
            if (!Array.isArray(params)) {
                throw new TypeError("findOptions.params must be an array");
            }
        }

        const sort = findOptions?.sort;
        if (!isNil(sort)) {
            if (typeof sort !== "object") {
                throw new TypeError("findOptions.sort must be an object");
            }
        }

        const where = findOptions?.where;
        if (!isNil(where)) {
            if (typeof where !== "string") {
                throw new TypeError("findOptions.where must be a string");
            }
        }

        const limit = findOptions?.limit;
        if (!isNil(limit)) {
            if (typeof limit !== "number") {
                throw new TypeError("findOptions.limit must be a number");
            }
        }

        const offset = findOptions?.offset;
        if (!isNil(offset)) {
            if (typeof offset !== "number") {
                throw new TypeError("findOptions.offset must be a number");
            }
        }

        const projection = fields?.length ?
            fields.map(f => {
                return shouldNotWrapFields ? `${f}` : `"${f}"`;
            }).join(",") :
            "*";

        // build query
        let q = `SELECT ${projection} FROM ${table}`;
        if (where?.length) {
            q += ` WHERE (${where})`;
        }
        if (sort) {
            q += ` ORDER BY ${Object.entries(sort)
                .map((entry) => {
                    return `"${entry[0]}" ${entry[1]}`;
                })
                .join(",")}`;
        }
        if (!isNil(limit)) {
            q += ` LIMIT ${limit}`;
        }
        if (!isNil(offset)) {
            q += ` OFFSET ${offset}`;
        }
        q += ";";

        return {
            "query": q,
            "params": params ?? []
        };
    }

    /**
     * @inheritdoc
     */
    public async count<T extends any = any>(type: Constructor<T>, options?: IPostgreSQLFindOptions | null): Promise<number> {
        const {
            params,
            query
        } = this.buildFindQuery(type, {
            ...(options || {}),

            "shouldNotWrapFields": true,
            "fields": [
                "COUNT(*) AS count"
            ]
        });

        const { rows } = await this.query(query, ...params);

        return Number(rows[0].count);
    }

    private get defaultValueTransformer(): SyncValueTransformer {
        if (this.context.noDbNull) {
            return transformValueUsingJSNull;
        }

        return transformValueUsingDbNull;
    }

    /**
     * @inheritdoc
     */
    public async find<T extends any = any>(type: Constructor<T>, options?: IPostgreSQLFindOptions | null): Promise<T[]> {
        const {
            params,
            query
        } = this.buildFindQuery(type, options);

        return this.queryAndMap(type, query, ...params);
    }

    /**
     * @inheritdoc
     */
    public async findOne<T extends any = any>(type: Constructor<T>, options?: IPostgreSQLFindOneOptions | null): Promise<T | null> {
        const entities = await this.find(type, {
            ...(options || {}),
            "limit": 1
        });

        return entities[0] || null;
    }

    /**
     * Gets the underlying client / pool.
     *
     * @returns {Promise<PostgreSQLClientLike>} The promise with the client.
     */
    public getClient(): Promise<PostgreSQLClientLike> {
        return Promise.resolve(this.#clientGetter());
    }

    private hasColumnValue(entity: any, columnName: PropertyKey): boolean {
        if (this.context.noDbNull) {
            return typeof entity[columnName] !== "undefined";
        }

        return !isNil(entity[columnName]);
    }

    /**
     * @inheritdoc
     */
    public async insert<T extends any = any>(entity: T): Promise<T>;
    public async insert<T extends any = any>(entities: List<T>): Promise<T[]>;
    public async insert<T extends any = any>(entityOrEntities: T | List<T>): Promise<T | T[]> {
        if (isNil(entityOrEntities)) {
            throw new TypeError("entityOrEntities cannot be (null) or (undefined)");
        }

        const isSingleEntity = !isIterable(entityOrEntities);
        const entities = asList(entityOrEntities)!;

        const result: T[] = [];

        for (const entity of entities) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getEntityNameByTypeOrThrow(type);
            const idCols = this.getEntityIdsByType(type);
            const valueCols = Object.keys(entity as any).filter(
                (columnName) => {
                    return this.hasColumnValue(entity, columnName);
                },
            );

            const values: any[] = [];
            for (const field of valueCols) {
                const value = (entity as any)[field];
                if (typeof value === "function") {
                    continue;  // ignore methods
                }

                values.push(
                    await this.transformValue({
                        "direction": "to",
                        field,
                        type,
                        value
                    })
                );
            }

            const columnList = valueCols.map((c) => {
                return `"${c}"`;
            }).join(",");
            const valueList = valueCols.map((c, i) => {
                return `$${i + 1}`;
            }).join(",");

            let returning = "";
            if (idCols.length) {
                returning = `RETURNING ${idCols.join(",")}`;
            }

            const queryResult = await this.query(
                `INSERT INTO ${table} (${columnList}) VALUES (${valueList})${returning};`,
                ...values,
            );

            if (idCols.length) {
                const row: Record<string, any> = queryResult.rows[0];

                // WHERE clause for getting new, inserted entity
                const whereInserted = Object.keys(row)
                    .map((columnName, index) => {
                        return `"${columnName}"=$${index + 1}`;
                    })
                    .join(" AND ");
                const params = Object.values(row);

                // get new row as entity with new and updated data
                result.push(
                    await this.findOne(type, {
                        "where": whereInserted,
                        params
                    })
                );
            }
            else {
                // no ID column(s), so return simple entity
                result.push(entity);
            }
        }

        return isSingleEntity ? result[0] : result;
    }

    private async mapEntityWithRow(entity: any, row: Record<string, any>) {
        const type: Constructor = (entity as any).constructor;

        for (const [field, value] of Object.entries(row)) {
            if (typeof value === "function") {
                continue;  // ignore methods
            }

            if (field in entity) {
                // only if column is prop of entity

                entity[field] = await this.transformValue({
                    "direction": "from",
                    field,
                    type,
                    value
                });
            }
        }
    }

    /**
     * Invokes a raw SQL query.
     *
     * @param {string} sql The SQL query,
     * @param {any[]} [values] One or more values for the placeholders in the SQL query.
     *
     * @returns {Promise<QueryResult<any>>} The promise with the result.
     */
    public async query(sql: string, ...values: any[]): Promise<QueryResult<any>> {
        this.#debug(`SQL QUERY: ${sql}`, "🐞");

        const client = await this.getClient();

        return client.query(sql, values);
    }

    /**
     * @inheritdoc
     */
    public async *queryAndIterate<T extends any = any>(type: Constructor<T>, sql: string, ...values: any[]): AsyncGenerator<T> {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        let CursorClass: any;
        if (this.#cursorClass) {
            CursorClass = this.#cursorClass.default ??
                this.#cursorClass;
        }
        else {
            CursorClass = require("pg-cursor");
        }

        const client = await this.getClient();
        const cursor: PgCursor = await client.query(new CursorClass(sql, values));

        try {
            do {
                const rows = await cursor.read(this.#chunkSize);
                if (rows.length === 0) {
                    break;
                }

                for (const row of rows) {
                    const newEntity = new type();
                    await this.mapEntityWithRow(newEntity, row);

                    yield newEntity;
                }
            } while (true);
        }
        finally {
            await cursor.close();
        }
    }

    /**
     * @inheritdoc
     */
    public async queryAndMap<T extends any = any>(type: Constructor<T>, sql: string, ...values: any[]): Promise<T[]> {
        this.#debug(`SQL QUERY AND MAP: ${sql}`, "🐞");

        const client = await this.getClient();
        const sqlResult = await client.query(sql, values);

        const entities: T[] = [];

        for (const row of sqlResult.rows) {
            const newEntity = new type();
            await this.mapEntityWithRow(newEntity, row);

            entities.push(newEntity);
        }

        return entities;
    }

    /**
     * @inheritdoc
     */
    public async remove<T extends any = any>(entity: T): Promise<T>;
    public async remove<T extends any = any>(entities: List<T>): Promise<T[]>;
    public async remove<T extends any = any>(entityOrEntities: T | List<T>): Promise<T | T[]> {
        if (isNil(entityOrEntities)) {
            throw new TypeError("entityOrEntities cannot be (null) or (undefined)");
        }

        const isSingleEntity = !isIterable(entityOrEntities);
        const entities = asList(entityOrEntities)!;

        const result: T[] = [];

        for (const entity of entities) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getEntityNameByTypeOrThrow(type);
            const idCols = this.getEntityIdsByTypeOrThrow(type);

            // collect ID values
            const idValues: any[] = [];
            for (const field of idCols) {
                const value = (entity as any)[field];

                idValues.push(
                    await this.transformValue({
                        "direction": "to",
                        field,
                        type,
                        value
                    })
                );
            }

            let i = 0;

            // WHERE clause
            const where = idCols
                .map((columnName) => {
                    return `"${columnName}"=$${++i}`;
                })
                .join(" AND ");

            // build and run query
            await this.query(
                `DELETE FROM ${table} WHERE (${where});`,
                ...idValues,
            );

            // simply return entity
            result.push(entity);
        }

        return isSingleEntity ? result[0] : result;
    }

    private async transformValue(options: ITransformValueOptions): Promise<any> {
        const { direction, field, type, value } = options;

        const entity = this.getEntityByType(type);

        if (entity) {
            const transformer = entity.config?.fields?.[field]?.transformer?.[direction];
            if (transformer) {
                return Promise.resolve(transformer(value));
            }
        }

        return this.defaultValueTransformer(options);
    }

    /**
     * @inheritdoc
     */
    public async update<T extends any = any>(entity: T): Promise<T>;
    public async update<T extends any = any>(entities: List<T>): Promise<T[]>;
    public async update<T extends any = any>(entityOrEntities: T | List<T>): Promise<T | T[]> {
        if (isNil(entityOrEntities)) {
            throw new TypeError("entityOrEntities cannot be (null) or (undefined)");
        }

        const isSingleEntity = !isIterable(entityOrEntities);
        const entities = asList(entityOrEntities)!;

        const result: T[] = [];

        for (const entity of entities) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getEntityNameByTypeOrThrow(type);
            const idCols = this.getEntityIdsByTypeOrThrow(type);
            const valueCols = Object.keys(entity as any).filter(
                (columnName) => {
                    return !idCols.includes(columnName) &&
                        this.hasColumnValue(entity, columnName);
                },
            );

            if (!valueCols.length) {
                continue;  // nothing to do
            }

            const addValuesTo = async (fields: string[], vals: any[]) => {
                for (const field of fields) {
                    const value = (entity as any)[field];
                    if (typeof value === "function") {
                        continue;  // ignore methods
                    }

                    vals.push(
                        await this.transformValue({
                            "direction": "to",
                            field,
                            type,
                            value
                        })
                    );
                }
            };

            let i = 0;

            // values to update
            const values: any[] = [];
            await addValuesTo(valueCols, values);
            const set = valueCols
                .map((columnName) => {
                    return `"${columnName}"=$${++i}`;
                })
                .join(",");

            // WHERE clause
            const idValues: any[] = [];
            await addValuesTo(idCols, idValues);
            const where = idCols
                .map((columnName) => {
                    return `"${columnName}"=$${++i}`;
                })
                .join(" AND ");

            // now build and run query
            await this.query(
                `UPDATE ${table} SET ${set} WHERE (${where});`,
                ...[...values, ...idValues],
            );

            // WHERE clause for getting updated entity
            const whereUpdated = idCols
                .map((columnName, index) => {
                    return `"${columnName}"=$${index + 1}`;
                })
                .join(" AND ");

            // get updated entity
            result.push(
                await this.findOne(type, {
                    "where": whereUpdated,
                    "params": idValues
                })
            );
        }

        return isSingleEntity ? result[0] : result;
    }
}

function toClientGetter(
    { value }: IToClientGetterOptions
): Getter<PostgreSQLClientLike> {
    if (typeof value === "function") {
        return value;
    }
    else if (isPostgreSQLClientLike(value)) {
        return async () => {
            return value;
        };
    }
    else if (isNil(value) || typeof value === "object") {
        const pool = new Pool(value as PoolConfig || undefined);

        return () => {
            return pool;
        };
    }

    throw new TypeError("value cannot be used as client or pool");
}