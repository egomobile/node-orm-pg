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

import type { EntityConfigurations, IDataContext } from "@egomobile/orm";
import { escapeStringForQuery } from "./internal";

/**
 * Options for `updateComments()` function.
 */
export interface IUpdateCommentsOptions {
    /**
     * The configurations from where to get the documentation/comments from.
     */
    configurations: EntityConfigurations;
    /**
     * The underlying database connection / context.
     */
    context: IDataContext;
}

/**
 * Updates the COMMENT attributes of documented tables and columns.
 *
 * @param {IUpdateCommentsOptions} options The options.
 */
export async function updateComments(options: IUpdateCommentsOptions) {
    const {
        configurations,
        context
    } = options;

    const entityConfigEntries = Object.entries(configurations);
    for (const [tableName, tableConfig] of entityConfigEntries) {
        const tableComment = tableConfig?.comment?.trim();
        if (typeof tableComment === "string") {
            let updateTableCommentQuery: string;
            if (tableComment !== "") {
                const escapedTableComment = escapeStringForQuery(tableComment);

                updateTableCommentQuery = `COMMENT ON TABLE ${tableName} IS '${escapedTableComment}';`;
            }
            else {
                updateTableCommentQuery = `COMMENT ON TABLE ${tableName} IS NULL;`;
            }

            await context.query(updateTableCommentQuery);
        }

        const tableColumnConfigEntries = Object.entries(tableConfig.fields ?? {});
        for (const [columnName, columnConfig] of tableColumnConfigEntries) {
            const fullColumnName = `${tableName}.${columnName}`;

            const tableColumnComment = columnConfig?.comment?.trim();
            if (typeof tableColumnComment === "string") {
                let updateTableColumnCommentQuery: string;
                if (tableColumnComment !== "") {
                    const escapedTableColumnComment = escapeStringForQuery(tableColumnComment);

                    updateTableColumnCommentQuery = `COMMENT ON TABLE ${fullColumnName} IS '${escapedTableColumnComment}';`;
                }
                else {
                    updateTableColumnCommentQuery = `COMMENT ON TABLE ${fullColumnName} IS NULL;`;
                }

                await context.query(updateTableColumnCommentQuery);
            }
        }
    }
}
