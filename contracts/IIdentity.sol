// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

interface IIdentity {
    struct PubKey64 {
        bytes32 part1;
        bytes32 part2;
    }

    event IdentityRegistered(
        string handle,
        address identityOwner,
        PubKey64 commPublicKey
    );
    event IdentityOwnershipTransferred(
        string indexed handle,
        address indexed oldOwner,
        address indexed newOwner,
        uint256 date
    );
    event IKVSet(string identity, string key, string value, string version);

    event IdentityDeployerChanged(
        string identity,
        address deployer,
        bool allowed
    );

    function setMaxHandleLength(uint256 value) external;

    function getMaxHandleLength() external view returns (uint256);

    function setOracleAddress(address addr) external;

    function getOracleAddress() external view returns (address);

    function setDevMode(bool value) external;

    function getDevMode() external view returns (bool);

    function registerVerified(
        string calldata handle,
        address identityOwner,
        bytes32 commPublicKeyPart1,
        bytes32 commPublicKeyPart2,
        bytes32 _hashedMessage,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external;

    function register(
        string calldata handle,
        address identityOwner,
        bytes32 commPublicKeyPart1,
        bytes32 commPublicKeyPart2
    ) external;

    function canonical(string memory anyCase)
        external
        view
        returns (string memory canonicalCase);

    function getIdentityByOwner(address owner)
        external
        view
        returns (string memory identity);

    function getOwnerByIdentity(string memory identity)
        external
        view
        returns (address owner);

    function getCommPublicKeyByIdentity(string memory identity)
        external
        view
        returns (PubKey64 memory commPublicKey);

    function ikvPut(
        string memory identity,
        string memory key,
        string memory value,
        string memory version
    ) external;

    function ikvImportKV(
        string memory identity,
        string memory key,
        string memory value,
        string memory version
    ) external;

    function ikvGet(string memory identity, string memory key)
        external
        view
        returns (string memory value);

    function finishMigrations() external;

    function transferIdentityOwnership(string memory handle, address newOwner)
        external;

    function addIdentityDeployer(string memory handle, address deployer)
        external;

    function removeIdentityDeployer(string memory handle, address deployer)
        external;

    function isIdentityDeployer(string memory handle, address deployer)
        external
        view
        returns (bool);
}
