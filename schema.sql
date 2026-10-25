CREATE TABLE dbo.Users (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(254) NOT NULL
);

INSERT INTO dbo.Users (Name, Email)
VALUES
    (N'Nguyen Van A', N'a@example.com'),
    (N'Tran Van B', N'b@example.com'),
    (N'Le Thi C', N'c@example.com');
