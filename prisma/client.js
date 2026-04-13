const { PrismaClient } = require("@prisma/client");

const normalizeRole = (value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return normalized || value;
};

const normalizeRoleInArgs = (args) => {
  if (!args || typeof args !== "object") return;

  if (args.data && typeof args.data === "object" && !Array.isArray(args.data)) {
    if (Object.prototype.hasOwnProperty.call(args.data, "role")) {
      args.data.role = normalizeRole(args.data.role);
    }
  }

  if (Array.isArray(args.data)) {
    args.data = args.data.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (!Object.prototype.hasOwnProperty.call(item, "role")) return item;
      return {
        ...item,
        role: normalizeRole(item.role),
      };
    });
  }
};

const basePrisma = new PrismaClient();

const prisma = basePrisma.$extends({
  query: {
    user: {
      async create({ args, query }) {
        normalizeRoleInArgs(args);
        return query(args);
      },
      async update({ args, query }) {
        normalizeRoleInArgs(args);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args && typeof args === "object") {
          normalizeRoleInArgs({ data: args.create });
          normalizeRoleInArgs({ data: args.update });
        }
        return query(args);
      },
      async createMany({ args, query }) {
        normalizeRoleInArgs(args);
        return query(args);
      },
      async updateMany({ args, query }) {
        normalizeRoleInArgs(args);
        return query(args);
      },
    },
  },
});

module.exports = prisma;
