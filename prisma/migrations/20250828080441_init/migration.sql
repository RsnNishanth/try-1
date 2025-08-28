-- CreateTable
CREATE TABLE "public"."UserDetails" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,

    CONSTRAINT "UserDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_username_key" ON "public"."UserDetails"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserDetails_email_key" ON "public"."UserDetails"("email");
