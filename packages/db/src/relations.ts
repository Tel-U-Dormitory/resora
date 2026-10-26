import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = {
	...defineRelations(schema),
	...schema.authRelations,
	...schema.identityRelations,
	...schema.attendanceRelations,
	...schema.committeeRelations,
	...schema.broadcastRelations,
	user: {
		...schema.authRelations.user,
		relations: {
			...schema.authRelations.user.relations,
			...schema.identityRelations.user.relations,
		},
	},
};
