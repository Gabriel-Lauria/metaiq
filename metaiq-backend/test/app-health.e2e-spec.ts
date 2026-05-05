import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";

jest.setTimeout(60000);

describe("Application health E2E", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
    process.env.CRYPTO_SECRET =
      process.env.CRYPTO_SECRET || "test-crypto-secret";
    process.env.META_APP_ID = process.env.META_APP_ID || "123456789012345";
    process.env.META_APP_SECRET =
      process.env.META_APP_SECRET || "test-meta-secret";
    process.env.META_REDIRECT_URI =
      process.env.META_REDIRECT_URI ||
      "http://localhost:3004/api/integrations/meta/oauth/callback";

    const { AppModule } = await import("../src/app.module");
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns health status without exposing secrets", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .set("x-request-id", "health-test-request")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.checks.database.status).toBe("unknown");
    expect(response.body.checks.crypto.status).toBe("ok");
    expect(response.body.checks.meta.status).toBe("ok");
    expect(response.headers["x-request-id"]).toBe("health-test-request");
    expect(JSON.stringify(response.body)).not.toContain("test-jwt-secret");
    expect(JSON.stringify(response.body)).not.toContain("test-only-jwt-secret");
    expect(JSON.stringify(response.body)).not.toContain("test-only-meta-secret");
    expect(JSON.stringify(response.body)).not.toContain("test");
  });

  it("returns readiness when the database is reachable", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/ready")
      .expect(200);

    expect(response.body.status).toBe("degraded");
    expect(response.body.checks.database.status).toBe("ok");
    expect(response.body.checks.metricsSync.status).toBe("degraded");
  });

  it("returns liveness without checking dependencies", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/live")
      .expect(200);

    expect(response.body).toEqual({ status: "alive" });
  });

  it("returns a generic API descriptor without infrastructure details", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/api")
      .expect(200);

    expect(response.body).toEqual({
      name: "Nexora Backend API",
      status: "ok",
    });
    expect(JSON.stringify(response.body)).not.toContain("postgresql://");
    expect(JSON.stringify(response.body)).not.toContain("endpoint");
  });
});
