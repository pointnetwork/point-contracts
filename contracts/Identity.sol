// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// Inteface to be used by other contracts that need to interact with identity contract
import "./IIdentity.sol";

/// @title Identity contract
/// @notice This contracts control identity related features in Point Network.
contract Identity is
    IIdentity,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    /// Map identity handle to his owner.
    mapping(string => address) public identityToOwner;
    
    /// Map the owner address to his identity.
    mapping(address => string) public ownerToIdentity;
    
    /// Maps for each identity a set of key-value pairs which are used to store values for identities.
    mapping(string => mapping(string => string)) public ikv;

    /// List of keys present in ikv map for each identity.
    mapping(string => string[]) public ikvList;

    /// Maps the lowercase identity to its canonical form (the original cased used).
    mapping(string => string) public lowercaseToCanonicalIdentities;

    /// Maps the identity to its communcation public key.
    mapping(string => PubKey64) public identityToCommPublicKey;

    /// List all the registered identities
    string[] public identityList;

    /// Indicate if the migrations is already applied in the contract
    bool public migrationApplied;

    /// Max length of a handle (identity name)
    uint256 private MAX_HANDLE_LENGTH;

    /// Maps for each identity which addresses are allowed to deploy a dapp for the identity
    mapping(string => mapping(address => bool)) private _isIdentityDeployer;

    /// The address of the oracle which validates twitter identity and sign msg with the confirmation for this contract.
    address private oracleAddress;

    /// Mode that bypass external validations such as oracle signed msg. Used only for development.
    bool private devMode;

    /// Maps for each identity and key the version of the key-value pair.
    mapping(string => mapping(string => string)) public ikversion;

    /// Maps for each identity the list of addresses allowed to be deployers of the account
    mapping(string => address[]) private _identityDeployerList;

    /// Maps for each identity and deployer address the block in which the deployer was added or updated
    mapping(string => mapping(address => uint256)) private _identityDeployerBlock;
    
    /// List all dapps registered
    string[] public dappsList;

    /// Maps for each address the list of subidentities owned by it
    mapping(address => string[]) public ownerToSubidentitiesList;

    /// Struct for answering queries about identities
    struct IdentityQuery{
        string handle;
        address owner;
        bool hasDomain;
    }

    /// Struct for answering queries about IKV
    struct IKVSetQuery{
        string identity;
        string key; 
        string value; 
        string version;
    }

    /// Struct to answer queries about deployers
    struct DeployersQuery{
        string identity;
        address deployer;
        bool allowed;
        uint256 blockNumber;
    }
    
    /// Initializer method, called once by the proxy when it is deployed.
    /// Setup and initialize constant values for the contract.
    function initialize() public initializer onlyProxy {
        __Ownable_init();
        __UUPSUpgradeable_init();
        migrationApplied = false;
        MAX_HANDLE_LENGTH = 32;
        oracleAddress = 0x8E2Fb20C427b54Bfe8e529484421fAE41fa6c9f6;
        devMode = false;
    }

    /// Set the max length for identities
    /// @param value - the max length allowed
    /// @dev used only in migrations and restricted to the owner of the contract
    function setMaxHandleLength(uint256 value) public override onlyOwner {
        MAX_HANDLE_LENGTH = value;
    }

    /// Get max handle length for identities
    /// @return MAX_HANDLE_LENGTH - max handle length for identities
    function getMaxHandleLength() public view override returns (uint256) {
        return MAX_HANDLE_LENGTH;
    }

    /// Set the oracle address
    /// @param addr - address for the oracle
    /// @dev - Can only be called by the owner of the identity contract
    function setOracleAddress(address addr) public override onlyOwner {
        oracleAddress = addr;
    }

    /// Get the oracle address
    /// @return oracleAddress - the address of the owner of the oracle 
    function getOracleAddress() public view override returns (address) {
        return oracleAddress;
    }

    /// Set the development mode
    /// @param value - development mode flag
    /// @dev can only be set by the owner of the identity contract
    function setDevMode(bool value) public override onlyOwner {
        devMode = value;
    }

    /// Get the development mode flag
    /// @return devMode - if are set in development mode
    function getDevMode() public view override returns (bool) {
        return devMode;
    }
    
    /// Set if migrations were applied
    /// @param value - if the migrations were applied.
    function setMigrationApplied(bool value) public onlyOwner {
        migrationApplied = value;
    }

    /// Function that is called to authorize upgrade of the proxy, if don't revert is authorized.
    /// Only the owner of the contract can authorize the upgrade of the proxy.
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// Modifier that checks if the sender of the message is the owner of the identity passed
    /// @param identity - the ideintity to check if the sender is the owner.
    modifier onlyIdentityOwner(string memory identity) {
        require(
            msg.sender == getOwnerByIdentity(identity),
            "You are not the owner of this identity"
        );
        // todo: identityToOwner[identity] == address(0) ?
        _;
    }

    /// Modifier that checks if the sender of the message is a deployer for the identity passed
    /// @param identity - the ideintity to check if the sender is a deployer of it.
    modifier onlyIdendityDeployer(string memory identity) {
        require(
            msg.sender == getOwnerByIdentity(identity) ||
                _isIdentityDeployer[identity][msg.sender] == true,
            "You are not deployer of this identity"
        );
        _;
    }

    /// Modifier that check if the migrations were already applied
    modifier onlyBeforeMigrations() {
        require(migrationApplied == false, "Access denied");
        _;
    }

    /// Register a new identity checking if the oracle proper validated if before registering
    /// @param handle - the identity that will be registered
    /// @param identityOwner - the address which will be the owner of the identity
    /// @param commPublicKeyPart1 - Part1 of the communication public key
    /// @param commPublicKeyPart2 - Part2 of the communication public key
    /// @param _hashedMessage - The hashed and ECDSA signed message from the oracle for validation
    /// @param _v - v parameter for ECDSA signature
    /// @param _r - r parameter for ECDSA signature
    /// @param _s - s parameter for ECDSA signature
    function registerVerified(
        string calldata handle,
        address identityOwner,
        bytes32 commPublicKeyPart1,
        bytes32 commPublicKeyPart2,
        bytes32 _hashedMessage,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public override {
        //checks if the identity is valid for production and it is not a subidentity
        _validateIdentity(handle, identityOwner, false, false);

        // Check oracle msg for confirming that identity can be registered.
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHashMessage = keccak256(
            abi.encodePacked(prefix, _hashedMessage)
        );

        //recover the address of the signer of the message
        //if the message is different of the signed one the address will be wrong either
        address signer = ecrecover(prefixedHashMessage, _v, _r, _s);

        //if the message is not signed by the oracle reverts because is not valid
        require(
            signer == oracleAddress,
            "Identity claim msg must be signed by the oracle"
        );

        //mount the expected msg that should be sent by the oracle if the identity is free
        bytes32 expectedMsgFree = keccak256(
            abi.encodePacked(
                _toLower(handle),
                "|",
                Strings.toHexString(uint256(uint160(identityOwner)), 20),
                "|free"
            )
        );
        
        //mount the expected msg that should be sent by the oracle if the identity already have a twitter handle
        bytes32 expectedMsgTaken = keccak256(
            abi.encodePacked(
                _toLower(handle),
                "|",
                Strings.toHexString(uint256(uint160(identityOwner)), 20),
                "|taken"
            )
        );

        //if the msg is not one of the two expected reverts
        require(
            _hashedMessage == expectedMsgFree ||
                _hashedMessage == expectedMsgTaken,
            "Invalid identity claim msg"
        );

        //ok, go for registering.
        PubKey64 memory commPublicKey = PubKey64(
            commPublicKeyPart1,
            commPublicKeyPart2
        );

        //register the identity
        _selfReg(handle, identityOwner, commPublicKey);
    }

    /// Validate one idenitity
    /// @param handle - the identity to be vilidadete
    /// @param identityOwner - the address of the owner of the identity
    /// @param ynet - if is running in ynet network
    /// @param isSubidentity - If is a subidentity for validation    
    function _validateIdentity(
        string calldata handle,
        address identityOwner,
        bool ynet,
        bool isSubidentity
    ) private view returns (bool) {
        // if ynet network then the handle must start with ynet_
        if (ynet == true) {
            require(
                keccak256(abi.encodePacked(_toLower(handle[0:5]))) ==
                    keccak256(abi.encodePacked("ynet_")),
                "ynet handles must start with ynet_"
            );
        }

        // if migration is already applied, cannot register identity for other address than sender 
        if (migrationApplied == true) {
            require(
                msg.sender == identityOwner,
                "Cannot register identities for other address than sender"
            );
        }

        // checks if the handle has only valid characters
        if (!_isValidHandle(handle)) {
            revert("Only alphanumeric characters and an underscore allowed");
        }

        // Check if the identity is already registered
        string memory lowercase = _toLower(handle);
        if (!isSubidentity && !_isEmptyString(lowercaseToCanonicalIdentities[lowercase])) {
            revert("This identity has already been registered");
        }

        // if the migrations was already applied and is not subidentity
        if (migrationApplied == true && !isSubidentity) {
            // Check if this owner already has an identity attached
            if (!_isEmptyString(ownerToIdentity[identityOwner]))
                revert("This owner already has an identity attached");
        }

        return true;
    }

    /// Register an identity without validating the message of the oracle.
    /// Only works for ynet_ prefixed identities or for all identities if in dev mode.
    /// @param handle - the identity that will be registered
    /// @param identityOwner - the address which will be the owner of the identity
    /// @param commPublicKeyPart1 - Part1 of the communication public key
    /// @param commPublicKeyPart2 - Part2 of the communication public key
    function register(
        string calldata handle,
        address identityOwner,
        bytes32 commPublicKeyPart1,
        bytes32 commPublicKeyPart2
    ) public override {
        //validate the identity
        _validateIdentity(handle, identityOwner, !devMode, false);

        //ok, go for registering.
        PubKey64 memory commPublicKey = PubKey64(
            commPublicKeyPart1,
            commPublicKeyPart2
        );

        // register
        _selfReg(handle, identityOwner, commPublicKey);
    }

    /// Register a subidentity
    /// @param subhandle - the subidentity that will be registered
    /// @param handle - the identity in that the subidentity will be registered
    /// @param identityOwner - the address which will be the owner of the identity
    /// @param commPublicKeyPart1 - Part1 of the communication public key
    /// @param commPublicKeyPart2 - Part2 of the communication public key
    function registerSubidentity(
        string calldata subhandle,
        string calldata handle,
        address identityOwner,
        bytes32 commPublicKeyPart1,
        bytes32 commPublicKeyPart2
    ) public override onlyIdentityOwner(handle) {
        // note: only validating subhandle, because handle was validated at creation,
        // and non-existing handles would not pass the ownership check
        _validateIdentity(subhandle, identityOwner, false, true);

        // optimized string concatenation
        string memory fullHandle = string(abi.encodePacked(subhandle, ".", handle));
        string memory fullHandleLowercase = _toLower(fullHandle);

        if (!_isEmptyString(lowercaseToCanonicalIdentities[fullHandleLowercase])) {
            revert("This identity has already been registered");
        }

        PubKey64 memory commPublicKey = PubKey64(
            commPublicKeyPart1,
            commPublicKeyPart2
        );

        // updating identityToOwner, but not ownerToIdentity
        identityToOwner[fullHandle] = identityOwner;
        identityToCommPublicKey[fullHandle] = commPublicKey;
        lowercaseToCanonicalIdentities[fullHandleLowercase] = fullHandle;
        identityList.push(fullHandle);
        ownerToSubidentitiesList[identityOwner].push(fullHandle);

        emit SubidentityRegistered(handle, subhandle, identityOwner, commPublicKey);
    }

    /// Get the canonical representation of the identity (with the case that was used in the registration)
    /// @param anyCase - the identity represented in any case
    /// @return canonicalCase - the original case representation of the identity
    function canonical(string memory anyCase)
        public
        view
        override
        returns (string memory canonicalCase)
    {
        string memory lowercase = _toLower(anyCase);
        return lowercaseToCanonicalIdentities[lowercase];
    }

    /// Get the identity from an address (owner)
    /// @param owner - the address of the owner
    /// @return identity - the identity which is owned
    function getIdentityByOwner(address owner)
        public
        view
        override
        returns (string memory identity)
    {
        return ownerToIdentity[owner];
    }

    /// Get the owner address of one identity
    /// @param identity - the identity to look for the owner
    /// @return owner - the owner of the identity
    function getOwnerByIdentity(string memory identity)
        public
        view
        override
        returns (address owner)
    {
        return identityToOwner[canonical(identity)];
    }

    /// Get the communication public key from one identity
    /// @param identity - the identity to get the communication public key
    /// @return commPublicKey - the comunication public key of the identity
    function getCommPublicKeyByIdentity(string memory identity)
        public
        view
        override
        returns (PubKey64 memory commPublicKey)
    {
        return identityToCommPublicKey[canonical(identity)];
    }

    /// Insert a key-value pair in the registry of an identity
    /// Only available for deployers of the identity
    /// @param identity - the identity which the key-value will be inserted
    /// @param key - key to insert the value
    /// @param value - the value to be inserted
    /// @param version - the version for the key-value pair
    function ikvPut(
        string memory identity,
        string memory key,
        string memory value,
        string memory version
    ) public override onlyIdendityDeployer(identity) {
        ikvSet(identity, key, value, version);
    }

    /// Insert a key-value pair in the registry of an identity
    /// Only available before migrations being applied
    /// @param identity - the identity which the key-value will be inserted
    /// @param key - key to insert the value
    /// @param value - the value to be inserted
    /// @param version - the version for the key-value pair
    function ikvImportKV(
        string memory identity,
        string memory key,
        string memory value,
        string memory version
    ) public override onlyBeforeMigrations {
        ikvSet(identity, key, value, version);
    }

    /// Insert a version for key-value pair in the registry of an identity
    /// Only available before migrations being applied
    /// @param identity - the identity which the key-value will be inserted
    /// @param key - key to insert the value
    /// @param version - the version for the key-value pair
    function ikVersionImport(
        string memory identity,
        string memory key,
        string memory version
    ) public onlyBeforeMigrations {
        ikversion[identity][key] = version;
    }

    /// Add a Dapp (identity) to the list of dapps
    /// Only avaliable before migrations
    /// @param identity - the identity to be added
    function dappsListImport(string memory identity) public onlyBeforeMigrations {
        dappsList.push(identity);
    }

    /// Add a subidentity to the list of subidentities
    /// Only avaliable before migrations
    /// @param owner - The owner of the identity
    /// @param subidentity - The subidentity to be added
    function subidentitiesListImport(address owner, string memory subidentity) public onlyBeforeMigrations {
        ownerToSubidentitiesList[owner].push(subidentity);
    }

    /// Check if an identity is a dapp
    /// @param identity - the identity to check
    //// @return bool - if the identity is a dapp
    function isDapp(string memory identity) public view returns (bool){
        return bytes(ikv[identity]["zdns/routes"]).length != 0;
    }

    /// Get the value of a key from an identity.
    /// @param identity - the identity register to be consulted
    /// @param key - which key will be queried
    /// @return value - the value from the key on that identity
    function ikvGet(string memory identity, string memory key)
        public
        view
        override
        returns (string memory value)
    {
        return ikv[identity][key];
    }

    /// get the version of an key-value pair from an identity
    /// @param identity - the identity which the pair belongs
    /// @param key - the key to be queried
    /// @return value - the version of the key-value pair
    function ikVersionGet(string memory identity, string memory key)
        public
        view
        returns (string memory value)
    {
        return ikversion[identity][key];
    }

    /// Sets the migrations as finished
    function finishMigrations() external override {
        migrationApplied = true;
    }

    /// Transfer the ownership of an identity
    /// @param handle - the idenity to be transfered
    /// @param newOwner - the address of the new owner of the identity
    /// only avaliable for the identity owner.
    /// @dev this functions seems to be lacking data transfer to some data structures.
    function transferIdentityOwnership(string memory handle, address newOwner)
        public
        override
        onlyIdentityOwner(handle)
    {
        require(
            newOwner != address(0),
            "Can't transfer ownership to address 0"
        );
        require(
            newOwner != msg.sender,
            "Can't transfer ownership to same address"
        );
        require(
            bytes(ownerToIdentity[newOwner]).length == 0,
            "Owner already has a handle."
        );

        address oldOwner = msg.sender;

        delete ownerToIdentity[oldOwner];

        identityToOwner[handle] = newOwner;
        ownerToIdentity[newOwner] = handle;

        emit IdentityOwnershipTransferred(
            handle,
            oldOwner,
            newOwner,
            block.timestamp
        );
    }

    /// Authorize one address as a deployer of an identity
    /// @param handle - the identity to add the deployer
    /// @param deployer - the addres of the deployer to be added
    /// only avaliable for the identity owner
    function addIdentityDeployer(string memory handle, address deployer)
        public
        override
        onlyIdentityOwner(handle)
    {
        //validate the deployer data
        //cannot be 0 address
        require(deployer != address(0), "Can't set address 0 as deployer");
        //cannot be the owner of the identity, which is already a deployer by default
        require(
            deployer != getOwnerByIdentity(handle),
            "Owner is already a deployer"
        );
        //cannot already be a deployer for this identity
        require(
            _isIdentityDeployer[handle][deployer] != true,
            "Address is already a deployer"
        );

        //add the data to the data structures needed
        _isIdentityDeployer[handle][deployer] = true;
        _identityDeployerList[handle].push(deployer);   
        _identityDeployerBlock[handle][deployer] = block.number;

        //emit the related event
        emit IdentityDeployerChanged(handle, deployer, true);
    }

    /// Remove the authorization of an identity as a deployer
    /// @param handle - the identity which the deployer will be unauthorized
    /// @param deployer - the address of the deployer to be unauthorized
    function removeIdentityDeployer(string memory handle, address deployer)
        public
        override
        onlyIdentityOwner(handle)
    {
        //validate the deployer data
        //the address cannot be zero
        require(deployer != address(0), "Can't remove address 0 as deployer");
        //cannot remove the owner of the identity as a deployer
        require(
            deployer != getOwnerByIdentity(handle),
            "Owner can't be removed as a deployer"
        );
        //cannot remove who is not a deployer
        require(
            _isIdentityDeployer[handle][deployer] == true,
            "Address is not a deployer"
        );

        //set the deployer authorization as false and register when (block.number) 
        //the authoriza was revoked
        _isIdentityDeployer[handle][deployer] = false;
        _identityDeployerBlock[handle][deployer] = block.number;

        //emit the related event
        emit IdentityDeployerChanged(handle, deployer, false);
    }

    /// Checks if an addres is a deployer of an identity
    /// @param handle - the identity handle 
    /// @param deployer - the address of the deployer to be checked
    /// @return bool - if the address is a deployer of the identity
    function isIdentityDeployer(string memory handle, address deployer)
        public
        view
        override
        returns (bool)
    {
        if (deployer == getOwnerByIdentity(handle)) {
            return true;
        }
        return _isIdentityDeployer[handle][deployer];
    }

    /// Check if a char is valid for be included in an identity handle
    /// @param char - the char to be verified
    /// @return bool - if the char is valid (0-9 A-Z a-z _)
    function _isValidChar(bytes1 char) internal pure returns (bool) {
        return ((char >= bytes1(uint8(0x30)) && char <= bytes1(uint8(0x39))) || // 9-0
            (char >= bytes1(uint8(0x41)) && char <= bytes1(uint8(0x5A))) || // A-Z
            (char >= bytes1(uint8(0x61)) && char <= bytes1(uint8(0x7A))) || // a-z
            (char == bytes1(uint8(0x5f)))); // '_'
    }

    /// Validate the chars and length of a string handle to be considered as a valid identity
    /// @param str - the handle to be validated
    /// @return bool - if the handle is valid 
    function _isValidHandle(string memory str) internal view returns (bool) {
        bytes memory b = bytes(str);
        if (b.length > MAX_HANDLE_LENGTH) return false;

        for (uint256 i; i < b.length; i++) {
            bytes1 char = b[i];

            if (!_isValidChar(char)) {
                return false; // neither alpha-numeric nor '_'
            }
        }

        return true;
    }

    /// Converts a string to lowercase
    /// @param str - the string to be converted
    /// @return string - the string converted to lower case
    function _toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            // Is it an uppercase alphabetic character?
            if (
                (bStr[i] >= bytes1(uint8(65))) && (bStr[i] <= bytes1(uint8(90)))
            ) {
                // Yes, add 32 to make it lowercase
                bLower[i] = bytes1(uint8(uint256(uint8(bStr[i])) + 32));
            } else {
                // No
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }

    /// Check if a string is empty 
    /// @param str - the string to be checked
    /// @return result - if the string is empty
    function _isEmptyString(string memory str)
        internal
        pure
        returns (bool result)
    {
        return (bytes(str).length == 0);
    }

    /// add the identity data to the proper data structures for registering it
    /// @param handle - the identity handle
    /// @param owner - the address of the owner
    /// @param commPublicKey - the communication public key of the owner
    function _selfReg(
        string memory handle,
        address owner,
        PubKey64 memory commPublicKey
    ) internal {
        // Attach this identity to the owner address
        identityToOwner[handle] = owner;
        ownerToIdentity[owner] = handle;

        // Attach public key for communication
        identityToCommPublicKey[handle] = commPublicKey;

        // Add canonical version
        lowercaseToCanonicalIdentities[_toLower(handle)] = handle;

        // Add the handle to identity list so that it can be iterated over
        identityList.push(handle);

        // Emit the related event
        emit IdentityRegistered(handle, owner, commPublicKey);
    }

    /// Set a key-value pair for an identity
    /// @param identity - the identity handle to register the key-value pair
    /// @param key - the key to be used
    /// @param value - the value to be set
    /// @param version - the version of the key-value pair
    function ikvSet(
        string memory identity,
        string memory key,
        string memory value,
        string memory version
    ) internal {
        if (bytes(ikv[identity][key]).length == 0) {
            ikvList[identity].push(key);
        }

        //checks if the key is from a dapp
        string memory dappsKey = "zdns/routes";
        if (_compareStrings(key, dappsKey) == true){
            //verify if is the first time that this key is being set  
            if (bytes(ikv[identity]["zdns/routes"]).length == 0) {
                //add the identity to the dapps list
                dappsList.push(identity);
            }
        }

        //set the ikv
        ikv[identity][key] = value;
        //set the version of the ikv
        ikversion[identity][key] = version;

        //emit the related event
        emit IKVSet(identity, key, value, version);
    }

    /// Get the length of the identity list (number of identities)
    /// @return uint - the number of identities registered
    function getIdentitiesLength() public view returns (uint){
        return identityList.length;
    }
    
    /// Get a set of identities given the parameters passed
    /// @param cursor - in which position of the list of identities the set will start
    /// @param howMany - how many identities will be included starting in the cursor
    /// @return IdentityQuery[] - a set of identities in the IdentityQuery format
    function getPaginatedIdentities(uint256 cursor, uint256 howMany) public view returns (IdentityQuery[] memory) {
        uint256 length = howMany;
        if(length > identityList.length - cursor) {
            length = identityList.length - cursor;
        }

        IdentityQuery[] memory _identities = new IdentityQuery[](length);
        for (uint256 i = length; i > 0; i--) {
            string memory identity = identityList[identityList.length - cursor - i];
            address owner = identityToOwner[identity];

            //check if it has a dapp
            if (bytes(ikv[identity]["zdns/routes"]).length != 0) {
                _identities[length-i] = IdentityQuery(identity, owner, true);
            }else{
                _identities[length-i] = IdentityQuery(identity, owner, false);
            }
        }
        return _identities;
    }

    /// Get all key-value pairs from one identity
    /// @param identity - The identity to be queried
    /// @return IKVSetQuery - all key-value pairs of an identity in the IKVSetQuery format
    function getIkvList(string calldata identity) public view returns (IKVSetQuery[] memory) {
        uint256 length = ikvList[identity].length;
        IKVSetQuery[] memory _ikvList = new IKVSetQuery[](length);
        for (uint256 i = 0; i < length; i++) {
            string memory key = ikvList[identity][i];
            string memory value = ikv[identity][key];
            string memory version = ikversion[identity][key];
            _ikvList[i] = IKVSetQuery(identity, key, value, version); 
        }
        return _ikvList;
    }

    /// Get all deployers of an identity
    /// @param identity - the identity to be queried
    /// @return DeployersQuery - the list of deployers in the DeployersQuery[] format 
    function getDeployersList(string calldata identity) public view returns (DeployersQuery[] memory) {
        uint256 length = _identityDeployerList[identity].length;
        DeployersQuery[] memory _deployersList = new DeployersQuery[](length);
        for (uint256 i = 0; i < length; i++) {
            address addr = _identityDeployerList[identity][i];
            _deployersList[i] = DeployersQuery(
                identity, 
                addr,
                _isIdentityDeployer[identity][addr],
                _identityDeployerBlock[identity][addr]
                );
        }
        return _deployersList;
    }
    
    /// Get the length of the dappsList (number of dapps)
    /// @return uint - number of dapps 
    function getDappsLength() public view returns (uint){
        return dappsList.length;
    }

    /// Get a set of dapps given the parameters passed
    /// @param cursor - in which position of the list of dapps the set will start
    /// @param howMany - how many dapps will be included starting in the cursor
    /// @return IdentityQuery[] - a set of dapps in the IdentityQuery format
    function getPaginatedDapps(uint256 cursor, uint256 howMany) public view returns (IdentityQuery[] memory) {
        uint256 length = howMany;
        if(length > dappsList.length - cursor) {
            length = dappsList.length - cursor;
        }

        IdentityQuery[] memory _dapps = new IdentityQuery[](length);
        for (uint256 i = length; i > 0; i--) {
            string memory identity = dappsList[dappsList.length - cursor - i];
            address owner = identityToOwner[identity];

            _dapps[length-i] = IdentityQuery(identity, owner, true);
        }
        return _dapps;
    }

    /// Compare two strings and return if they are equal
    /// @param a - first string
    /// @param b - second string
    /// @return bool - if they are equal
    function _compareStrings(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    /// Get the the list of all subidentity owned by one address
    /// @param owner - the owner which will be used to get all subidentities related
    /// @return string[] - the list of subidentities owned by the address
    function getSubidentitiesByOwner(address owner) public view returns (string[] memory){
        return ownerToSubidentitiesList[owner];
    }
    
    /// Regster one identity (for migration only)
    /// @param handleCanonical - the handle in any case format
    /// @param handleLowerCase - the handle in lower case format
    /// @param owner - the address of the owner
    /// @param commPublicKeyPart1 - Communication public key part 1
    /// @param commPublicKeyPart2 - Communication public key part 2 
    function importReg(string calldata handleCanonical, string calldata handleLowerCase, address owner,
        bytes32 commPublicKeyPart1, bytes32 commPublicKeyPart2) public onlyBeforeMigrations {

        PubKey64 memory commPublicKey = PubKey64(
            commPublicKeyPart1,
            commPublicKeyPart2
        );

        // Attach this identity to the owner address
        identityToOwner[handleCanonical] = owner;
        ownerToIdentity[owner] = handleCanonical;

        // Attach public key for communication
        identityToCommPublicKey[handleCanonical] = commPublicKey;

        // Add canonical version
        lowercaseToCanonicalIdentities[handleLowerCase] = handleCanonical;

        // Add the handle to identity list so that it can be iterated over
        identityList.push(handleCanonical);

        emit IdentityRegistered(handleCanonical, owner, commPublicKey);
    }


}
